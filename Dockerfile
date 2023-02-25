FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk update && apk upgrade && apk add --no-cache git
RUN npm ci
COPY . .

RUN npx tsc
CMD node index.js