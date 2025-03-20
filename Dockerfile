FROM mongodb/mongodb-community-server
USER root
RUN apt-get update && apt-get install -y iproute2
