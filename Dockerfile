FROM balenalib/raspberrypi3-debian-node:8-latest
RUN [ "cross-build-start" ]




RUN mkdir /App/


COPY App/package.json  /App/package.json

RUN cd /App/ \
&& npm  install 

COPY App /App

RUN [ "cross-build-end" ]  

ENTRYPOINT ["node","/App/app.js"]



