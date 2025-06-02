const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const STREAMS_PATH = path.join(__dirname, 'public');
const HLS_TIME = 10; // seconds per segment
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in ms

// Track running FFmpeg processes and last access time per stream
const streamProcesses = new Map();

app.use(express.static('public'));

// Function to start FFmpeg for a given stream ID
function startFFmpeg(streamId) {
  if (streamProcesses.has(streamId)) {
    // Already running
    return;
  }

  const streamUrl = `rtsp://146.59.54.160/${streamId}`;
  console.log(`Starting FFmpeg for stream ${streamId}`);

  const outputPath = path.join(STREAMS_PATH, `output_${streamId}.m3u8`);
  const segmentPattern = path.join(STREAMS_PATH, `output_${streamId}_%d.ts`);

  const proc = ffmpeg(streamUrl)
    .inputOptions('-rtsp_transport', 'tcp')
    .outputOptions([
      '-c:v copy',
      '-c:a aac',
      '-f hls',
      `-hls_time ${HLS_TIME}`,
      '-hls_list_size 6',
      `-hls_segment_filename ${segmentPattern}`
    ])
    .output(outputPath)
    .on('start', () => console.log(`FFmpeg started for stream ${streamId}`))
    .on('error', (err) => {
      console.error(`FFmpeg error for stream ${streamId}:`, err);
      stopFFmpeg(streamId); // Clean up on error
    })
    .on('end', () => {
      console.log(`FFmpeg ended for stream ${streamId}`);
      stopFFmpeg(streamId);
    })
    .run();

  streamProcesses.set(streamId, {
    process: proc,
    lastAccess: Date.now(),
    timeoutHandle: null,
  });

  // Setup inactivity timeout to kill FFmpeg after no viewers
  resetInactivityTimeout(streamId);
}

// Function to stop FFmpeg process and cleanup
function stopFFmpeg(streamId) {
  const info = streamProcesses.get(streamId);
  if (!info) return;

  if (info.timeoutHandle) clearTimeout(info.timeoutHandle);

  try {
    info.process.kill('SIGKILL');
  } catch (e) {
    console.warn(`Error killing FFmpeg process for stream ${streamId}`, e);
  }

  // Remove HLS files (optional)
  const files = fs.readdirSync(STREAMS_PATH);
  files.forEach(file => {
    if (file.startsWith(`output_${streamId}_`) || file === `output_${streamId}.m3u8`) {
      fs.unlinkSync(path.join(STREAMS_PATH, file));
    }
  });

  streamProcesses.delete(streamId);
  console.log(`Stopped FFmpeg and cleaned up for stream ${streamId}`);
}

// Reset inactivity timeout for a stream (called when user accesses stream)
function resetInactivityTimeout(streamId) {
  const info = streamProcesses.get(streamId);
  if (!info) return;

  if (info.timeoutHandle) clearTimeout(info.timeoutHandle);

  info.timeoutHandle = setTimeout(() => {
    console.log(`Inactivity timeout reached for stream ${streamId}, stopping FFmpeg`);
    stopFFmpeg(streamId);
  }, INACTIVITY_TIMEOUT);
}

// Middleware to handle HLS requests and trigger FFmpeg
app.get('/stream/:streamId.m3u8', (req, res) => {
  const streamId = req.params.streamId;

  // Start FFmpeg if not running
  if (!streamProcesses.has(streamId)) {
    startFFmpeg(streamId);
  } else {
    // Update last access and reset timeout
    const info = streamProcesses.get(streamId);
    info.lastAccess = Date.now();
    resetInactivityTimeout(streamId);
  }

  // Serve the m3u8 playlist file
  const filePath = path.join(STREAMS_PATH, `output_${streamId}.m3u8`);

  // Wait for the file to exist (FFmpeg needs some time to create it)
  const waitForFile = (retries = 10) => {
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else if (retries > 0) {
      setTimeout(() => waitForFile(retries - 1), 500);
    } else {
      res.status(503).send('Stream not ready yet, please try again shortly');
    }
  };

  waitForFile();
});

// Also serve TS segment files (static)
app.get('/stream/:streamId/:segment', (req, res) => {
  const streamId = req.params.streamId;
  const segment = req.params.segment;

  const filePath = path.join(STREAMS_PATH, segment);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Segment not found');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
