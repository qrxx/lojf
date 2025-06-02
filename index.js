const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const STREAMS_PATH = path.join(__dirname, 'public');
const HLS_TIME = 10; // seconds per segment
const INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes in ms

// Ensure public directory exists
if (!fs.existsSync(STREAMS_PATH)) {
  fs.mkdirSync(STREAMS_PATH, { recursive: true });
}

// Track running FFmpeg processes and last access time per stream
const streamProcesses = new Map();

app.use(express.static('public'));

// Function to validate streamId
function isValidStreamId(streamId) {
  return /^[a-zA-Z0-9_-]+$/.test(streamId);
}

// Function to start FFmpeg for a given stream ID
function startFFmpeg(streamId) {
  if (streamProcesses.has(streamId)) {
    console.log(`FFmpeg already running for stream ${streamId}`);
    return;
  }

  const streamUrl = `rtsp://146.59.54.160/${streamId}`;
  console.log(`Starting FFmpeg for stream ${streamId} with URL ${streamUrl}`);

  const outputPath = path.join(STREAMS_PATH, `output_${streamId}.m3u8`);
  const segmentPattern = path.join(STREAMS_PATH, `output_${streamId}_%03d.ts`);

  const proc = ffmpeg(streamUrl)
    .inputOptions(['-rtsp_transport', 'tcp', '-re']) // -re for real-time streaming
    .outputOptions([
      '-c:v copy',
      '-c:a aac',
      '-f hls',
      `-hls_time ${HLS_TIME}`,
      '-hls_list_size 6',
      `-hls_segment_filename ${segmentPattern}`,
      '-hls_flags delete_segments' // Auto-delete old segments
    ])
    .output(outputPath)
    .on('start', () => console.log(`FFmpeg started for stream ${streamId}`))
    .on('error', (err) => {
      console.error(`FFmpeg error for stream ${streamId}:`, err.message);
      stopFFmpeg(streamId);
    })
    .on('end', () => {
      console.log(`FFmpeg ended for stream ${streamId}`);
      stopFFmpeg(streamId);
    })
    .on('progress', (progress) => {
      console.log(`FFmpeg progress for stream ${streamId}: ${progress.percent}%`);
    });

  try {
    proc.run();
    streamProcesses.set(streamId, {
      process: proc,
      lastAccess: Date.now(),
      timeoutHandle: null,
    });
    resetInactivityTimeout(streamId);
  } catch (err) {
    console.error(`Failed to start FFmpeg for stream ${streamId}:`, err.message);
    stopFFmpeg(streamId);
  }
}

// Function to stop FFmpeg process and cleanup
function stopFFmpeg(streamId) {
  const info = streamProcesses.get(streamId);
  if (!info) return;

  if (info.timeoutHandle) clearTimeout(info.timeoutHandle);

  try {
    info.process.kill('SIGTERM'); // Use SIGTERM for graceful shutdown
    console.log(`FFmpeg process terminated for stream ${streamId}`);
  } catch (e) {
    console.warn(`Error killing FFmpeg process for stream ${streamId}:`, e.message);
  }

  // Clean up HLS files
  try {
    const files = fs.readdirSync(STREAMS_PATH);
    files.forEach(file => {
      if (file.startsWith(`output_${streamId}_`) || file === `output_${streamId}.m3u8`) {
        try {
          fs.unlinkSync(path.join(STREAMS_PATH, file));
          console.log(`Deleted file: ${file}`);
        } catch (e) {
          console.warn(`Error deleting file ${file}:`, e.message);
        }
      }
    });
  } catch (e) {
    console.warn(`Error reading directory for cleanup of stream ${streamId}:`, e.message);
  }

  streamProcesses.delete(streamId);
  console.log(`Stopped FFmpeg and cleaned up for stream ${streamId}`);
}

// Reset inactivity timeout for a stream
function resetInactivityTimeout(streamId) {
  const info = streamProcesses.get(streamId);
  if (!info) return;

  if (info.timeoutHandle) clearTimeout(info.timeoutHandle);

  info.lastAccess = Date.now();
  info.timeoutHandle = setTimeout(() => {
    console.log(`Inactivity timeout reached for stream ${streamId}, stopping FFmpeg`);
    stopFFmpeg(streamId);
  }, INACTIVITY_TIMEOUT);
}

// Middleware to handle HLS requests and trigger FFmpeg
app.get('/stream/:streamId.m3u8', (req, res) => {
  const streamId = req.params.streamId;

  if (!isValidStreamId(streamId)) {
    return res.status(400).send('Invalid stream ID');
  }

  if (!streamProcesses.has(streamId)) {
    startFFmpeg(streamId);
  } else {
    const info = streamProcesses.get(streamId);
    info.lastAccess = Date.now();
    resetInactivityTimeout(streamId);
  }

  const filePath = path.join(STREAMS_PATH, `output_${streamId}.m3u8`);
  const maxRetries = 20; // Increased retries for slower streams
  const retryInterval = 500;

  const waitForFile = (retries) => {
    if (fs.existsSync(filePath)) {
      console.log(`Serving m3u8 file for stream ${streamId}`);
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error(`Error sending m3u8 file for stream ${streamId}:`, err.message);
          res.status(500).send('Error serving stream');
        }
      });
    } else if (retries > 0) {
      console.log(`Waiting for m3u8 file for stream ${streamId}, retries left: ${retries}`);
      setTimeout(() => waitForFile(retries - 1), retryInterval);
    } else {
      console.error(`Stream ${streamId} not ready after max retries`);
      res.status(503).send('Stream not ready yet, please try again shortly');
    }
  };

  waitForFile(maxRetries);
});

// Serve TS segment files
app.get('/stream/:streamId/:segment', (req, res) => {
  const { streamId, segment } = req.params;

  if (!isValidStreamId(streamId)) {
    return res.status(400).send('Invalid stream ID');
  }

  const filePath = path.join(STREAMS_PATH, segment);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`Error sending segment ${segment} for stream ${streamId}:`, err.message);
        res.status(500).send('Error serving segment');
      }
    });
  } else {
    console.error(`Segment ${segment} not found for stream ${streamId}`);
    res.status(404).send('Segment not found');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down');
  streamProcesses.forEach((_, streamId) => stopFFmpeg(streamId));
  process.exit(0);
});
