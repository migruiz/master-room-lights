const { Observable, merge, timer, interval, of } = require('rxjs');
const { mergeMap, withLatestFrom, map, share, shareReplay, filter, mapTo, take, debounceTime, throttle, throttleTime, startWith, takeWhile, delay, scan, distinct, distinctUntilChanged, tap, flatMap, takeUntil, toArray, groupBy } = require('rxjs/operators');
var mqtt = require('./mqttCluster.js');
global.mtqqLocalPath = 'mqtt://192.168.0.11';




const buttonControl = new Observable(async subscriber => {
  var mqttCluster = await mqtt.getClusterAsync()
  mqttCluster.subscribeData('zigbee2mqtt/0x187a3efffed62b0d', function (content) {
    subscriber.next(content)
  });
});


const masterButtonSharedStream = buttonControl.pipe(
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
    if (curr.action === 'brightness_step_up') return { ...acc, masterState: true, brigthnessValue: acc.brigthnessValue + 30 > 254 ? 254 : acc.brigthnessValue + 30 }
    if (curr.action === 'brightness_step_down') return { ...acc, masterState: true, brigthnessValue: acc.brigthnessValue - 30 < 2 ? 2 : acc.brigthnessValue - 30 }
    if (curr.action === 'color_temperature_step_up') return { ...acc, masterState: true, colorTemp: acc.colorTemp + 30 > 454 ? 454 : acc.colorTemp + 30 }
    if (curr.action === 'color_temperature_step_down') return { ...acc, masterState: true, colorTemp: acc.colorTemp - 30 < 250 ? 250 : acc.colorTemp - 30 }
    if (curr.action === 'toggle') return { ...acc, masterState: !acc.masterState }

  }, { masterState: false, brigthnessValue: 30, colorTemp: 30 }),
  share()
)


const longDelaySensorStream = masterButtonSharedStream.pipe(  
  map(_=> ({ started: Date.now(), delay: 5000 })),
)


const sensorStream = merge(longDelaySensorStream).pipe(
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
  filter(a => a.emission != null)
)

combinedSensorStream.subscribe(async m => { 
  console.log(JSON.stringify(m.emission))
})

return;


const actuatorStream = merge(manualStream)

actuatorStream.subscribe(async m => {
  if (!m.masterState) {
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ brightness: 0 }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ brightness: 0 }));
  }
  else {
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ brightness: m.brigthnessValue }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ brightness: m.brigthnessValue }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ color_temp: m.colorTemp }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ color_temp: m.colorTemp }));
  }

})

