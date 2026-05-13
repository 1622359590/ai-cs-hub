FROM node:22-slim

WORKDIR /app

# better-sqlite3 编译依赖
RUN apt-get update && apt-get install -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --production

COPY . .

# 数据目录
RUN mkdir -p /app/data /app/uploads

EXPOSE 37888

CMD ["node", "server.js"]
