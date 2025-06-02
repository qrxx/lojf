const express = require('express');
     const ffmpeg = require('fluent-ffmpeg');
     const app = express();
     const port = process.env.PORT || 3000;

     // Serve static files (HLS output)
     app.use(express.static('public'));

     // FFmpeg to convert RTSP to HLS
     ffmpeg('rtsp://146.59.54.160/312')
       .inputOptions('-rtsp_transport', 'tcp')
       .outputOptions([
         '-c:v copy',
         '-c:a aac',
         '-f hls',
         '-hls_time 10',
         '-hls_list_size 6',
         '-hls_segment_filename public/output%d.ts'
       ])
       .output('public/output.m3u8')
       .on('start', () => console.log('FFmpeg started'))
       .on('error', (err) => console.error('FFmpeg error:', err))
       .on('end', () => console.log('FFmpeg finished'))
       .run();

     // Start the server
     app.listen(port, () => {
       console.log(`Server running on port ${port}`);
     });
