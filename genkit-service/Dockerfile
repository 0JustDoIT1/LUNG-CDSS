FROM node:22-slim

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY src ./src

EXPOSE 8002
CMD ["node", "src/index.js"]
