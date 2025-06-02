const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Store active FFmpeg processes to prevent duplicates
const activeStreams = {};

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle dynamic RTSP stream requests
app.get('/:streamId/output.m3u8', (req, res) => {
  const streamId = req.params.streamId;
  // Validate streamId (basic validation, can be extended)
  if (!/^\d+$/.test(streamId)) {
    return res.status(400).send('Invalid stream ID');
  }

  // Construct RTSP URL internally
  const rtspUrl = `rtsp://146.59.54.160/${streamId}`;

  // Check if stream is already running
  if (activeStreams[streamId]) {
    console.log(`Serving existing stream for ID ${streamId}`);
    return res.sendFile(path.join(__dirname, 'public', `output_${streamId}.m3u8`));
  }

  // Set output file paths
  const outputM3u8 = path.join(__dirname, 'public', `output_${streamId}.m3u8`);
  const segmentFile = path.join(__dirname, 'public', `output_${streamId}%d.ts`);

  // Configure FFmpeg with optimized settings
  const ffmpegProcess = ffmpeg(rtspUrl)
    .inputOptions('-rtsp_transport', 'tcp', '-buffer_size 102400') // Reduce buffer size
    .outputOptions([
      '-c:v libx264', // Use libx264 for better compression
      '-preset ultrafast', // Fast encoding to reduce CPU/memory usage
      '-tune zerolatency', // Optimize for low latency
      '-vf scale=640:360', // Downscale to 360p to save memory
      '-c:a aac',
      '-b:a 96k', // Lower audio bitrate
      '-f hls',
      '-hls_time 4', // Shorter segments for faster processing
      '-hls_list_size 4', // Smaller playlist to reduce memory
      `-hls_segment_filename ${segmentFile}`
    ])
    .output(outputM3u8);

  // Event handlers
  ffmpegProcess
    .on('start', () => {
      console.log(`FFmpeg started for stream ID ${streamId}`);
      activeStreams[streamId] = ffmpegProcess;
    })
    .on('error', (err) => {
      console.error(`FFmpeg error for stream ID ${streamId}:`, err);
      delete activeStreams[streamId];
      res.status(500).send('Error processing stream');
    })
    .on('end', () => {
      console.log(`FFmpeg finished for stream ID ${streamId}`);
      delete activeStreams[streamId];
    });

  // Start FFmpeg process
  ffmpegProcess.run();
  res.sendFile(outputM3u8);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
  Object.keys(activeStreams).forEach((streamId) => {
    activeStreams[streamId].kill();
    console.log(`Terminated FFmpeg process for stream ID ${streamId}`);
  });
  process.exit();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
