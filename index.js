const express = require('express');
     const ffmpeg = require('fluent-ffmpeg');
     const app = express();
     const port = process.env.PORT || 3000;

     app.use(express.static('public'));

     ffmpeg('rtsp://146.59.54.160/312')
       .inputOptions(['-rtsp_transport', 'tcp'])
       .outputOptions([
         '-c:v libx264',
         '-preset veryfast', // Faster encoding to reduce CPU load
         '-vf scale=480:270', // Lower resolution for free tier
         '-b:v 500k', // Lower bitrate for smoother streaming
         '-c:a aac',
         '-b:a 96k',
         '-f hls',
         '-hls_time 2', // Shorter segments for lower latency
         '-hls_list_size 6',
         '-hls_flags delete_segments+append_list', // Delete old segments, append new ones
         '-hls_segment_filename public/output%d.ts',
         '-hls_playlist_type event' // Continuous live streaming
       ])
       .output('public/output.m3u8')
       .on('start', () => console.log('FFmpeg started'))
       .on('error', (err) => console.error('FFmpeg error:', err))
       .on('end', () => console.log('FFmpeg finished unexpectedly'))
       .run();

     app.listen(port, () => {
       console.log(`Server running on port ${port}`);
     });
