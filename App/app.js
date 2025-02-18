const { Observable, merge, timer, interval } = require('rxjs');
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


const sensorOnSharedStream = merge(masterButtonSharedStream).pipe(
  mapTo({ action: 'on' }),
  share()
)

const offStream = sensorOnSharedStream.pipe(
  debounceTime(5000),
  mapTo({ action: 'off' }),
)

const autoSensorStream = merge(sensorOnSharedStream, offStream)


const manualStream = actionSharedStream.pipe(map(a => ({ ...a, trigger: 'manual' })))


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

