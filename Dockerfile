FROM balenalib/raspberrypi3-debian-node:8-latest
RUN [ "cross-build-start" ]




RUN apt-get update && \
apt-get install -yqq --no-install-recommends python3 python3-pip


RUN mkdir /python-broadlink

COPY python-broadlink /python-broadlink

RUN cd /python-broadlink \
&& python3 -m pip install setuptools \
&& python3 -m pip install pycparser \
&& python3 -m pip install cffi \
&& python3 -m pip install cryptography \
&& python3 setup.py install

RUN chmod +x /python-broadlink/cli/broadlink_cli
RUN chmod +x /python-broadlink/cli/broadlink_discovery

RUN mkdir /App/


COPY App/package.json  /App/package.json

RUN cd /App/ \
&& npm  install 

COPY App /App

RUN [ "cross-build-end" ]  

ENTRYPOINT ["node","/App/app.js"]



