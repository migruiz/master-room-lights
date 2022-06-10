var mqtt = require('mqtt')

class MQTTClient {
    constructor(mqttServer) {
        this.client=null;
        this.mqttServer=mqttServer
      }
    async initAsync(){
        this.client  = mqtt.connect(this.mqttServer)
        var self=this
        return new Promise(function (resolve, reject) {
            self.client.on('connect', function () {
                self.registerEvents()
                resolve()
            })
            self.client.on('error', function (error) {
                reject(error)
            })
        });



    }

    registerEvents(){

        this.client.on('reconnect', function () {
            console.log((new Date()).toString());
            console.log('reconnect');
        })
        this.client.on('close', function () {
            console.log((new Date()).toString());
            console.log('close');
        })
        this.client.on('offline', function () {
            console.log((new Date()).toString());
            console.log('offline');
        })
        this.client.on('error', function (error) {
            console.log((new Date()).toString());
            console.log('error');
            console.log(error);
        })
        this.client.on('end', function () {
            console.log((new Date()).toString());
            console.log('end');
        })
}

    subscribeData(topic, onData) {
        this.client.subscribe(topic);
        this.client.on("message", function (mtopic, message) {
            if (topic === mtopic) {
                var data = JSON.parse(message);
                onData(data);
            }
        });
    }
    publishData(topic, data) {
        var message = JSON.stringify(data);
        this.client.publish(topic, message);
    }
    publishMessage(topic, message) {
        this.client.publish(topic, message);
    }
}



var singleton;


exports.getClusterAsync = async function () {

    if (!singleton) {
        singleton = new MQTTClient(global.mtqqLocalPath);
        await singleton.initAsync()
    }    
    return singleton;
}