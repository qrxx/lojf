const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Map stream IDs to RTSP URLs (in production, use a config file or database)
const streamMap = {
  '314': 'rtsp://146.59.54.160/314'
};

// Store active FFmpeg processes and their last access time
const activeStreams = new Map();
const INACTIVITY_TIMEOUT = 60000; // 1 minute timeout for inactive streams

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic route for HLS stream
app.get('/:streamId/output.m3u8', (req, res) => {
  const streamId = req.params.streamId;

  // Validate streamId
  if (!streamMap[streamId]) {
    return res.status(404).send('Stream not found');
  }

  const rtspUrl = streamMap[streamId];
  const outputDir = path.join(__dirname, 'tmp', streamId);
  const outputFile = path.join(outputDir, 'output.m3u8');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if stream is already running
  if (!activeStreams.has(streamId)) {
    const ffmpegProc = ffmpeg(rtspUrl)
      .inputOptions('-rtsp_transport', 'tcp')
      .outputOptions([
        '-c:v copy', // Copy video to avoid re-encoding
        '-c:a aac', // Transcode audio to AAC if needed
        '-f hls',
        '-hls_time 4', // Smaller segment duration for lower latency
        '-hls_list_size 3', // Smaller playlist size for lower memory usage
        '-hls_segment_filename', path.join(outputDir, 'segment%d.ts'),
        '-hls_flags delete_segments' // Delete old segments to save disk space
      ])
      .output(outputFile)
      .on('start', () => console.log(`FFmpeg started for stream ${streamId}`))
      .on('error', (err) => {
        console.error(`FFmpeg error for stream ${streamId}:`, err);
        activeStreams.delete(streamId);
        // Clean up output directory
        fs.rmSync(outputDir, { recursive: true, force: true });
      })
      .on('end', () => {
        console.log(`FFmpeg ended for stream ${streamId}`);
        activeStreams.delete(streamId);
        fs.rmSync(outputDir, { recursive: true, force: true });
      });

    // Start FFmpeg
    ffmpegProc.run();
    activeStreams.set(streamId, { proc: ffmpegProc, lastAccess: Date.now() });
  } else {
    // Update last access time
    activeStreams.get(streamId).lastAccess = Date.now();
  }

  // Serve the HLS playlist
  res.sendFile(outputFile, (err) => {
    if (err) {
      console.error(`Error serving HLS playlist for stream ${streamId}:`, err);
      res.status(500).send('Error serving stream');
    }
  });
});

// Cleanup inactive streams
setInterval(() => {
  const now = Date.now();
  for (const [streamId, stream] of activeStreams) {
    if (now - stream.lastAccess > INACTIVITY_TIMEOUT) {
      console.log(`Stopping inactive stream ${streamId}`);
      stream.proc.kill();
      activeStreams.delete(streamId);
      const outputDir = path.join(__dirname, 'tmp', streamId);
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  }
}, 10000); // Check every 10 seconds

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
