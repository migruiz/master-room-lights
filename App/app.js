const { Observable,merge,timer, interval } = require('rxjs');
const { mergeMap, withLatestFrom, map,share,shareReplay, filter,mapTo,take,debounceTime,throttle,throttleTime, startWith, takeWhile, delay, scan, distinct,distinctUntilChanged, tap, flatMap, takeUntil, toArray, groupBy} = require('rxjs/operators');
var mqtt = require('./mqttCluster.js');
global.mtqqLocalPath = 'mqtt://192.168.0.11';



const ledControlStream = new Observable(async subscriber => {  
  var mqttCluster=await mqtt.getClusterAsync()   
  mqttCluster.subscribeData('zigbee2mqtt/0x804b50fffe8b777a', function(content){
    //console.log(content);    
          subscriber.next(content)
  });
});

const ledControlStreamShared = ledControlStream.pipe(share())

const onOffStream = ledControlStreamShared.pipe(
  filter( m => m.action==='toggle')
)
const onRotationStream = ledControlStreamShared.pipe(
  filter( m => m.action==='brightness_up_hold' ||  m.action==='brightness_down_hold')
)
const onStopStream = ledControlStreamShared.pipe(
  filter( m => m.action==='brightness_up_release' || m.action==='brightness_down_release')
)
const leftRightStream = onRotationStream.pipe(
  flatMap( m => interval(30).pipe(

      startWith(1),
      takeUntil(onStopStream),
      mapTo(m)
  )));


  const colorRotationStream = ledControlStreamShared.pipe(
    filter( m => m.action==='arrow_right_hold' ||  m.action==='arrow_left_hold')
  )
  const colorStopStream = ledControlStreamShared.pipe(
    filter( m => m.action==='arrow_right_release' || m.action==='arrow_left_release')
  )

  const singleStateStream = ledControlStreamShared.pipe(
    filter( m => m.action==='arrow_left_click' || m.action==='arrow_right_click' || m.action==='brightness_down_click' || m.action==='brightness_up_click')
  ) 

  const colorLeftRightStream = colorRotationStream.pipe(
    flatMap( m => interval(200).pipe(
  
        startWith(1),
        takeUntil(colorStopStream),
        mapTo(m)
    )));

  const brightnessActionStream = merge(leftRightStream,onOffStream,colorLeftRightStream,singleStateStream).pipe(
    scan((acc, curr) => {
        if (curr.action==='brightness_up_hold') return { brigthnessValue: acc.brigthnessValue + 2 > 254 ? 254 : acc.brigthnessValue + 2, colorTemp: acc.colorTemp, action:'brigthness' } 
        if (curr.action==='brightness_up_click') return { brigthnessValue: acc.brigthnessValue + 25 > 254 ? 254 : acc.brigthnessValue + 25, colorTemp: acc.colorTemp, action:'brigthness' } 
        if (curr.action==='brightness_down_hold') return {brigthnessValue: acc.brigthnessValue - 2 < 2 ? 2 : acc.brigthnessValue - 2, colorTemp: acc.colorTemp, action:'brigthness' }
        if (curr.action==='brightness_down_click') return {brigthnessValue: acc.brigthnessValue - 25 < 2 ? 2 : acc.brigthnessValue - 25, colorTemp: acc.colorTemp, action:'brigthness' }
        if (curr.action==='arrow_right_hold') return {brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp + 10 > 454 ? 454 : acc.colorTemp + 10, action:'color' } 
        if (curr.action==='arrow_right_click') return {brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp + 25 > 454 ? 454 : acc.colorTemp + 25, action:'color' } 
        if (curr.action==='arrow_left_hold') return {brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp - 10 < 250  ? 250  : acc.colorTemp - 10, action:'color' }
        if (curr.action==='arrow_left_click') return {brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp - 25 < 250  ? 250  : acc.colorTemp - 25, action:'color' }
        if (curr.action==='toggle') return {brigthnessValue: acc.brigthnessValue, colorTemp: acc.colorTemp, action:'toggle'}
        
    }, {brigthnessValue:0, colorTemp: 0}),
    share()
)
brightnessActionStream.subscribe(async m => {
  if (m.action==='brigthness'){
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set',JSON.stringify({brightness:m.brigthnessValue}));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set',JSON.stringify({brightness:m.brigthnessValue}));
  }
  else if (m.action==='color'){
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set',JSON.stringify({color_temp: m.colorTemp}));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set',JSON.stringify({color_temp: m.colorTemp}));
  }
  else if (m.action==='toggle'){
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe8a196d/set',JSON.stringify({state: 'TOGGLE'}));
    (await mqtt.getClusterAsync()).publishMessage('zigbee2mqtt/0x04cd15fffe9d3c8a/set',JSON.stringify({state: 'TOGGLE'}));
  }
  
})


