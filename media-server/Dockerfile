FROM node:20

WORKDIR /app

# Install build dependencies required by mediasoup
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 4443
EXPOSE 2000-2020/udp

CMD ["npm", "start"]
