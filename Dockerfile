FROM mhart/alpine-node:9.7.1

WORKDIR /app
COPY . /app

RUN npm install
RUN npm test

EXPOSE 3000

CMD npm start
