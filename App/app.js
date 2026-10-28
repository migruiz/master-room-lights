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
  mqttCluster.subscribeData('zigbee2mqtt/0x90395efffe4d0098', function (content) {
    subscriber.next(content)
  });
});


// IKEA BILRESA scroll wheel (E2490), since 28/10/2026. Turning it sends
// brightness_move_to_level with action_level: the wheel's own position, 1 to 255, which knows
// nothing of the lights. So only which way it moved counts, and by how many clicks: a click is
// 14, a fast turn sends a few at once, and at either end it keeps sending 255 (or 1) while you
// carry on turning. Each click does what one click of the knobs above does. A press sends on
// and off in turn, whatever the lights are doing, so either one is a toggle.
const wheelControl = new Observable(async subscriber => {
  var mqttCluster = await mqtt.getClusterAsync()
  mqttCluster.subscribeData('zigbee2mqtt/0x1035970000a7952a', function (content) {
    subscriber.next(content)
  });
}).pipe(share())

const WHEEL_CLICK = 14
const wheelTurnStream = wheelControl.pipe(
  filter(c => c.action === 'brightness_move_to_level' && Number.isInteger(c.action_level)),
  scan((acc, c) => {
    const position = c.action_level
    const was = acc.position
    let action = null
    if (was !== null && position > was) action = 'brightness_step_up'
    else if (was !== null && position < was) action = 'brightness_step_down'
    else if (position >= 254) action = 'brightness_step_up'    // still turning past the top end
    else if (position <= 1) action = 'brightness_step_down'    // still turning past the bottom end
    // (After a restart the first turn in the middle only tells where the wheel is.)
    const clicks = (was === null || position === was) ? 1 : Math.min(4, Math.max(1, Math.round(Math.abs(position - was) / WHEEL_CLICK)))
    return { position, action, clicks }
  }, { position: null }),
  filter(w => w.action !== null),
  map(w => ({ action: w.action, clicks: w.clicks }))
)
const wheelPressStream = wheelControl.pipe(
  filter(c => c.action === 'on' || c.action === 'off'),
  mapTo({ action: 'toggle' })
)


const masterButtonSharedStream = merge(buttonControl1,buttonControl2,wheelTurnStream,wheelPressStream).pipe(
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
    // A knob click is one step of 30; the wheel can send a few clicks at once.
    const steps = curr.clicks || 1
    if (curr.action === 'brightness_step_up') return { ...acc, masterState: true, brightnessValue: Math.min(254, acc.brightnessValue + 30 * steps) }
    if (curr.action === 'brightness_step_down') return { ...acc, masterState: true, brightnessValue: Math.max(2, acc.brightnessValue - 30 * steps) }
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
  mqttCluster.subscribeData('zigbee2mqtt/0x00158d0009cf6fc4', function(content){        
      if (content.occupancy){      
          subscriber.next({content})
      }
  });
});


const shortDelaySensorStream = secondfloorSensorStream.pipe(
  map(_ => ({ started: Date.now(), delay: 1 * 60 * 1000 })),
)

const longDelaySensorStream = merge(masterButtonSharedStream, masterRoomSensorStream).pipe(
  map(_ => ({ started: Date.now(), delay: 15 * 60 * 1000 })),
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

