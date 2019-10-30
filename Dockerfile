FROM node:8-alpine

COPY ./rootfs/app/package.json ./rootfs/app/yarn.lock /app
RUN cd /app && yarn install && rm -rf /root/.cache /root/.npm /usr/local/share/.cache/yarn/

COPY ./rootfs/ /
WORKDIR /app

VOLUME ["/data"]

ENV STORE_TYPE="leveldb" \
    LEVELDB_PATH="/data/db" \
    REDIS_URI="redis://redis/0" \
    REDIS_PREFIX="baidupcs:" \
    EXPRESS_TEMP_FILE_FOLDER="/data/files"

CMD ["yarn", "start"]
