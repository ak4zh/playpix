FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk update && apk upgrade && apk add --no-cache git
RUN npm ci
COPY . .

ARG BOT_TOKEN
ENV BOT_TOKEN=$BOT_TOKEN
RUN npx tsc
CMD node index.js