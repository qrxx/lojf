const express = require('express');
     const ffmpeg = require('fluent-ffmpeg');
     const app = express();
     const port = process.env.PORT || 3000;

     app.use(express.static('public'));

     ffmpeg('rtsp://146.59.54.160/312')
       .inputOptions([
         '-rtsp_transport', 'tcp',
         '-reconnect 1',
         '-reconnect_streamed 1',
         '-reconnect_delay_max 5'
       ])
       .outputOptions([
         '-c:v libx264',
         '-vf scale=640:360',
         '-b:v 800k',
         '-c:a aac',
         '-b:a 128k',
         '-f hls',
         '-hls_time 4',
         '-hls_list_size 6',
         '-hls_flags delete_segments', // Delete old segments to save space
         '-hls_segment_filename public/output%d.ts',
         '-hls_playlist_type event' // Ensure continuous live streaming
       ])
       .output('public/output.m3u8')
       .on('start', () => console.log('FFmpeg started'))
       .on('error', (err) => console.error('FFmpeg error:', err))
       .on('end', () => console.log('FFmpeg finished'))
       .run();

     app.listen(port, () => {
       console.log(`Server running on port ${port}`);
     });
