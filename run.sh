#!/usr/bin/env bash

docker build -t twake-mobile-server .

if docker ps | grep -q twake-mobile-server; then
  docker stop twake-mobile-server
fi

if docker ps -a | grep -q twake-mobile-server; then
  docker rm -f twake-mobile-server
fi

docker run -e NODE_ENV=production -p 3123:80 --name twake-mobile-server -d twake-mobile-server
