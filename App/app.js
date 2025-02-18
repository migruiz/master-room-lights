const { Observable, merge, timer, interval, of } = require('rxjs');
const { mergeMap, withLatestFrom, map, share, shareReplay, filter, mapTo, take, debounceTime, throttle, throttleTime, startWith, takeWhile, delay, scan, distinct, distinctUntilChanged, tap, flatMap, takeUntil, toArray, groupBy } = require('rxjs/operators');
var mqtt = require('./mqttCluster.js');
global.mtqqLocalPath = 'mqtt://192.168.0.11';




const buttonControl1 = new Observable(async subscriber => {
  var mqttCluster = await mqtt.getClusterAsync()
  mqttCluster.subscribeData('zigbee2mqtt/0x187a3efffed62b0d', function (content) {
    subscriber.next(content)
  });
});
const buttonControl2 = new Observable(async subscriber => {
  var mqttCluster = await mqtt.getClusterAsync()
  mqttCluster.subscribeData('zigbee2mqtt/0x187a3efffed62b0d', function (content) {
    subscriber.next(content)
  });
});


const masterButtonSharedStream = merge(buttonControl1,buttonControl2).pipe(
  filter(c =>
    c.action === 'brightness_step_up' ||
    c.action === 'brightness_step_down' ||
    c.action === 'toggle' ||
    c.action === 'color_temperature_step_up' ||
    c.action === 'color_temperature_step_down'
  ),
  share()
)

const actionSharedStream = masterButtonSharedStream.pipe(
  scan((acc, curr) => {
    if (curr.action === 'brightness_step_up') return { ...acc, masterState: true, brightnessValue: acc.brightnessValue + 30 > 254 ? 254 : acc.brightnessValue + 30 }
    if (curr.action === 'brightness_step_down') return { ...acc, masterState: true, brightnessValue: acc.brightnessValue - 30 < 2 ? 2 : acc.brightnessValue - 30 }
    if (curr.action === 'color_temperature_step_up') return { ...acc, masterState: true, colorTemp: acc.colorTemp + 30 > 454 ? 454 : acc.colorTemp + 30 }
    if (curr.action === 'color_temperature_step_down') return { ...acc, masterState: true, colorTemp: acc.colorTemp - 30 < 250 ? 250 : acc.colorTemp - 30 }
    if (curr.action === 'toggle') return { ...acc, masterState: !acc.masterState }

  }, { masterState: false, brightnessValue: 30, colorTemp: 30 }),
  share()
)


const secondfloorSensorStream = new Observable(async subscriber => {  
  var mqttCluster=await mqtt.getClusterAsync()   
  mqttCluster.subscribeData('zigbee2mqtt/0x00158d0007c48250', function(content){        
      if (content.occupancy){      
          subscriber.next({content})
      }
  });
});

const masterRoomSensorStream = new Observable(async subscriber => {  
  var mqttCluster=await mqtt.getClusterAsync()   
  mqttCluster.subscribeData('zigbee2mqtt/0x00158d0007c48251', function(content){        
      if (content.occupancy){      
          subscriber.next({content})
      }
  });
});


const shortDelaySensorStream = secondfloorSensorStream.pipe(
  map(_ => ({ started: Date.now(), delay: 5000 })),
)

const longDelaySensorStream = merge(masterButtonSharedStream, masterRoomSensorStream).pipe(
  map(_ => ({ started: Date.now(), delay: 20000 })),
)


const sensorStream = merge(shortDelaySensorStream, longDelaySensorStream).pipe(
  flatMap(a => of(a).pipe(
    delay(a.delay),
    mapTo({ ...a, action: 'off' }),
    startWith({ ...a, action: 'on' }),
  ))
)

const combinedSensorStream = sensorStream.pipe(
  scan((acc, curr) => {
    if (curr.action === 'on' && curr.furthestOffEmission == null) return { furthestOffEmission: curr, emission: curr }
    if (curr.action === 'on' && curr.started + curr.delay > acc.furthestOffEmission.started + acc.furthestOffEmission.delay) return { furthestOffEmission: curr, emission: curr }
    if (curr.action === 'off' && acc.furthestOffEmission.started == curr.started) return { ...acc, emission: curr }
    return { ...acc, emission: null }
  }, { furthestOffEmission: null }),
  filter(a => a.emission != null),
  map(a => a.emission),
)


const autoStream = combinedSensorStream.pipe(
  withLatestFrom(actionSharedStream),
  map(([sensor, brightness]) => ({ ...brightness, trigger: 'auto', action: sensor.action })),
)

const manualStream = actionSharedStream.pipe(map(a => ({ trigger: 'manual', ...a })))

const actuatorStream = merge(manualStream, autoStream).pipe
  (
    map(a => {
      if (!a.masterState) return { ...a, brightnessValue: 0 }
      if (a.trigger === 'auto' && a.action === 'off') return { ...a, brightnessValue: 0 }
      return a
    }),
    distinctUntilChanged((prev, curr) => prev.brightnessValue === curr.brightnessValue && prev.colorTemp === curr.colorTemp)
  )

actuatorStream.subscribe(async m => {
  console.log(JSON.stringify(m));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ brightness: m.brightnessValue }));
  (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ brightness: m.brightnessValue }));
  (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ color_temp: m.colorTemp }));
  (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ color_temp: m.colorTemp }));

})

