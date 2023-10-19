const { Observable,merge,timer, interval } = require('rxjs');
const { mergeMap, withLatestFrom, map,share,shareReplay, filter,mapTo,take,debounceTime,throttle,throttleTime, startWith, takeWhile, delay, scan, distinct,distinctUntilChanged, tap, flatMap, takeUntil, toArray, groupBy} = require('rxjs/operators');
var mqtt = require('./mqttCluster.js');
global.mtqqLocalPath = 'mqtt://192.168.0.11';




const buttonControl = new Observable(async subscriber => {
  var mqttCluster = await mqtt.getClusterAsync()
  mqttCluster.subscribeData('zigbee2mqtt/0x187a3efffed62b0d', function (content) {
    subscriber.next(content)
  });
});


const masterButtonStream = buttonControl.pipe(
  filter(c =>
    c.action === 'brightness_step_up' ||
    c.action === 'brightness_step_down' ||
    c.action === 'toggle' ||
    c.action === 'color_temperature_step_up' ||
    c.action === 'color_temperature_step_down'
  )
)

const brightnessActionStream = masterButtonStream.pipe(
  scan((acc, curr) => {
    if (curr.action === 'brightness_step_up') return { brigthnessValue: acc.brigthnessValue + 30 > 254 ? 254 : acc.brigthnessValue + 30, colorTemp: acc.colorTemp, action: 'brigthness' }
    if (curr.action === 'brightness_step_down') return { brigthnessValue: acc.brigthnessValue - 30 < 1 ? 1 : acc.brigthnessValue - 30, colorTemp: acc.colorTemp, action: 'brigthness' }
    if (curr.action === 'color_temperature_step_up') return { brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp + 30 > 454 ? 454 : acc.colorTemp + 30, action: 'color' }
    if (curr.action === 'color_temperature_step_down') return { brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp - 30 < 250 ? 250 : acc.colorTemp - 30, action: 'color' }
    if (curr.action === 'toggle') return { brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp, action: 'toggle' }

  }, { brigthnessValue: 0, colorTemp: 0 })
)


brightnessActionStream.subscribe(async m => {
  if (m.action === 'brigthness') {
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ brightness: m.brigthnessValue }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ brightness: m.brigthnessValue }));
  }
  else if (m.action === 'color') {
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ color_temp: m.colorTemp }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ color_temp: m.colorTemp }));
  }
  else if (m.action === 'toggle') {
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set', JSON.stringify({ state: 'TOGGLE' }));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set', JSON.stringify({ state: 'TOGGLE' }));
  }

})

