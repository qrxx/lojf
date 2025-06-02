FROM node:16
     WORKDIR /app
     COPY package*.json ./
     RUN npm install
     RUN apt-get update && apt-get install -y ffmpeg
     COPY . .
     RUN mkdir -p /app/public
     EXPOSE 3000
     CMD ["npm", "start"]
