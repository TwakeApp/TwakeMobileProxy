FROM node:14.15.0-alpine3.12

WORKDIR /opt/app

ADD package.json /opt/app/package.json
RUN npm install --production
#ENV NODE_PATH=/opt/node_modules

COPY src /opt/app/src
COPY tsconfig.json /opt/app/tsconfig.json
EXPOSE 3123

CMD [ "npm", "start" ]
