FROM node:22-alpine
WORKDIR /app
COPY package.json server.js shim.js syncworker.js gsheets.js Code.gs ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
