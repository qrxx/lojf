const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

ffmpeg('rtsp://146.59.54.160/314')
  .inputOptions('-rtsp_transport', 'tcp')
  .outputOptions([
    '-c:v libx264', // Use H.264 encoding for better compatibility
    '-vf scale=640:360', // Scale to 640x360
    '-b:v 800k', // Set video bitrate to 800 kbps
    '-c:a aac',
    '-b:a 128k', // Set audio bitrate to 128 kbps
    '-f hls',
    '-hls_time 4', // Reduce segment duration for lower latency
    '-hls_list_size 6',
    '-hls_segment_filename public/output%d.ts'
  ])
  .output('public/output.m3u8')
  .on('start', () => console.log('FFmpeg started'))
  .on('error', (err) => console.error('FFmpeg error:', err))
  .on('end', () => console.log('FFmpeg finished'))
  .run();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
