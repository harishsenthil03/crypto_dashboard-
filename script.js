// ===== CONFIG =====
const BOT_TOKEN = "8353814081:AAEsVk7JiUZ9PezcKfm5Ni2ttF6A00fvsqI";
const CHAT_ID = "1407993694";
const EMA_FAST = 5;
const EMA_SLOW = 10;
let prices = [];
let lastSignal = "";
let entryPrice = null;
let autoSwitchEnabled = true;
let lastSwitchedCoin = null;

// Coin config
const COINS = {
  bitcoin:  { name: "BTC", id: "bitcoin" },
  ethereum: { name: "ETH", id: "ethereum" },
  solana:   { name: "SOL", id: "solana" },
  ripple:   { name: "XRP", id: "ripple" }
};

let currentCoin = localStorage.getItem("coin") || "bitcoin";
document.getElementById("coin").value = currentCoin;

let win = Number(localStorage.getItem("win")) || 0;
let loss = Number(localStorage.getItem("loss")) || 0;
let totalPnL = Number(localStorage.getItem("pnl")) || 0;

document.getElementById("winCount")?.innerText = win;
document.getElementById("lossCount")?.innerText = loss;
document.getElementById("pnl").innerText = totalPnL.toFixed(2);

// Coin stats and history
let coinStats = JSON.parse(localStorage.getItem("coinStats")) || {
  BTC: { win:0, loss:0, pnl:0 },
  ETH: { win:0, loss:0, pnl:0 },
  SOL: { win:0, loss:0, pnl:0 },
  XRP: { win:0, loss:0, pnl:0 }
};

let coinHistory = JSON.parse(localStorage.getItem("coinHistory")) || {
  BTC: [], ETH: [], SOL: [], XRP: []
};

// ===== TIME =====
function updateTime() {
  const now = new Date();
  document.getElementById("time").innerText = now.toLocaleTimeString("en-IN");
}
setInterval(updateTime, 1000);
updateTime();

// ===== EMA =====
function calculateEMA(period, data){
  const k = 2 / (period+1);
  let ema = data[0];
  for(let i=1;i<data.length;i++){
    ema = data[i]*k + ema*(1-k);
  }
  return ema;
}

// ===== TELEGRAM =====
function sendTelegram(msg){
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({chat_id:CHAT_ID, text:msg})
  });
}

// ===== SIGNAL HISTORY =====
function saveHistory(signal, price){
  const history = JSON.parse(localStorage.getItem("signals")) || [];
  history.unshift({
    time: new Date().toLocaleTimeString("en-IN"),
    signal: signal,
    price: price,
    coin: COINS[currentCoin].name
  });
  localStorage.setItem("signals", JSON.stringify(history));
  loadHistory();
}

function loadHistory(){
  const history = JSON.parse(localStorage.getItem("signals")) || [];
  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML="";
  history.slice(0,10).forEach(item=>{
    const row = `<tr>
      <td>${item.time}</td>
      <td>${item.coin}</td>
      <td class="${item.signal==='BUY'?'buy':'sell'}">${item.signal}</td>
      <td>$${item.price}</td>
    </tr>`;
    tbody.innerHTML+=row;
  });
}
loadHistory();

// ===== ACCURACY =====
function updateAccuracy(){
  const total = win + loss;
  const acc = total>0 ? ((win/total)*100).toFixed(2) : 0;
  document.getElementById("accuracy")?.innerText = acc + "%";
}
updateAccuracy();

// ===== CONFIDENCE =====
function calculateConfidence(coin){
  const stats = coinStats[coin];
  const trades = stats.win + stats.loss;
  if(trades===0) return 0;
  const accuracy = stats.win/trades;
  const pnlScore = Math.tanh(stats.pnl/10000);
  const confidence = (accuracy*0.7 + pnlScore*0.3)*100;
  return confidence.toFixed(2);
}

// ===== PRICE FETCH =====
async function getPrice(){
  try{
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${currentCoin}&vs_currencies=usd`);
    const data = await res.json();
    const price = data[currentCoin].usd;
    document.getElementById("price").innerText = COINS[currentCoin].name + " $" + price;

    prices.push(price);
    if(prices.length<EMA_SLOW) return;

    const emaFast = calculateEMA(EMA_FAST, prices.slice(-EMA_FAST));
    const emaSlow = calculateEMA(EMA_SLOW, prices.slice(-EMA_SLOW));

    // BUY
    if(emaFast>emaSlow && lastSignal!=="BUY"){
      lastSignal="BUY";
      entryPrice = price;
      document.getElementById("signal").innerText="🟢 BUY";
      sendTelegram("🟢 BUY " + COINS[currentCoin].name + "\nPrice: $" + price);
      saveHistory("BUY",price);
    }

    // SELL
    if(emaFast<emaSlow && lastSignal==="BUY"){
      lastSignal="SELL";
      document.getElementById("signal").innerText="🔴 SELL";
      sendTelegram("🔴 SELL " + COINS[currentCoin].name + "\nPrice: $" + price);
      saveHistory("SELL",price);

      // PnL + Win/Loss
      const capital = Number(document.getElementById("capital").value);
      const percent = ((price-entryPrice)/entryPrice)*100;
      const tradePnL = (capital*percent)/100;
      totalPnL+=tradePnL;
      localStorage.setItem("pnl",totalPnL);

      if(tradePnL>0){ win++; coinStats[COINS[currentCoin].name].win++; }
      else{ loss++; coinStats[COINS[currentCoin].name].loss++; }
      coinStats[COINS[currentCoin].name].pnl += tradePnL;
      localStorage.setItem("win",win);
      localStorage.setItem("loss",loss);
      localStorage.setItem("coinStats",JSON.stringify(coinStats));

      // Update coin history
      coinHistory[COINS[currentCoin].name].push(coinStats[COINS[currentCoin].name].pnl);
      if(coinHistory[COINS[currentCoin].name].length>20) coinHistory[COINS[currentCoin].name].shift();
      localStorage.setItem("coinHistory", JSON.stringify(coinHistory));

      document.getElementById("winCount")?.innerText = win;
      document.getElementById("lossCount")?.innerText = loss;

      updateAccuracy();
      updateTopCoin();
      updateLeaderboard();
      autoSwitchToTopCoin();

      entryPrice=null;
    }

  }catch(e){ console.log(e); }
}

// ===== TIMEFRAME =====
let interval;
function start(){
  if(interval) clearInterval(interval);
  const tf = Number(document.getElementById("timeframe").value);
  getPrice();
  interval = setInterval(getPrice, tf);
}
document.getElementById("timeframe").addEventListener("change", start);
start();

// ===== COIN SWITCH =====
function changeCoin(){
  currentCoin=document.getElementById("coin").value;
  localStorage.setItem("coin",currentCoin);
  prices=[]; lastSignal=""; entryPrice=null;
  document.getElementById("signal").innerText="Waiting";
  getPrice();
}

// ===== TOP COIN =====
function updateTopCoin(){
  let bestCoin=null,bestAccuracy=-1,bestPnL=-Infinity;
  for(let coin in coinStats){
    const stats = coinStats[coin];
    const total = stats.win+stats.loss;
    const acc = total>0?(stats.win/total)*100:0;
    const pnl = stats.pnl;
    if(acc>bestAccuracy||(acc===bestAccuracy&&pnl>bestPnL)){
      bestAccuracy=acc; bestPnL=pnl; bestCoin=coin;
    }
  }
  if(!bestCoin) return;
  const confScore = calculateConfidence(bestCoin);
  document.getElementById("topCoin").innerText=
    `${bestCoin} | 🎯 ${bestAccuracy.toFixed(2)}% | ₹${bestPnL.toFixed(2)} | Conf: ${confScore}%`;
  const barWidth = Math.min(confScore,100);
  document.getElementById("topBar").style.width = barWidth + "%";
}

// ===== LEADERBOARD =====
function updateLeaderboard(){
  const tbody = document.querySelector("#leaderboard tbody");
  tbody.innerHTML="";
  const rows = Object.keys(coinStats).map(coin=>{
    const w = coinStats[coin].win;
    const l = coinStats[coin].loss;
    const total=w+l;
    const acc = total>0?((w/total)*100).toFixed(2):"0.00";
    const pnl = coinStats[coin].pnl.toFixed(2);
    const conf = calculateConfidence(coin);
    return {coin,w,l,acc:Number(acc),pnl:Number(pnl),conf:Number(conf)};
  });
  rows.sort((a,b)=>b.acc!==a.acc?b.acc-a.acc:b.pnl-b.pnl);
  rows.forEach((r,index)=>{
    let rowClass="leaderboard-other";
    if(index===0) rowClass="leaderboard-top1";
    else if(index===1) rowClass="leaderboard-top2";
    else if(index===2) rowClass="leaderboard-top3";

    tbody.innerHTML+=`
      <tr class="${rowClass}">
        <td>${r.coin}</td>
        <td>${r.w}</td>
        <td>${r.l}</td>
        <td>${r.acc}%</td>
        <td>₹${r.pnl}</td>
        <td>${r.conf}%</td>
        <td><canvas id="spark-${r.coin}" width="80" height="20"></canvas></td>
      </tr>
    `;
  });

  // Draw sparkline charts
  rows.forEach(r=>{
    const ctx = document.getElementById(`spark-${r.coin}`);
    if(!ctx) return;
    new Chart(ctx, {
      type:'line',
      data: {
        labels: coinHistory[r.coin].map((v,i)=>i+1),
        datasets:[{
          data: coinHistory[r.coin],
          borderColor: '#22c55e',
          backgroundColor: 'transparent',
          tension:0.3,
          borderWidth:1
        }]
      },
      options:{
        responsive:false,
        plugins:{legend:{display:false}},
        scales:{x:{display:false},y:{display:false}}
      }
    });
  });
}
updateTopCoin();
updateLeaderboard();

// ===== AUTO SWITCH =====
function autoSwitchToTopCoin(){
  if(!autoSwitchEnabled) return;
  let bestCoin=null,bestAccuracy=-1,bestPnL=-Infinity;
  for(let coin in coinStats){
    const stats = coinStats[coin];
    const total = stats.win+stats.loss;
    if(total===0) continue;
    const acc = (stats.win/total)*100;
    const pnl = stats.pnl;
    if(acc>bestAccuracy||(acc===bestAccuracy&&pnl>bestPnL)){
      bestAccuracy=acc; bestPnL=pnl; bestCoin=coin;
    }
  }
  if(!bestCoin) return;
  const confScore = calculateConfidence(bestCoin);
  if(confScore<55) return;
  if(bestCoin===COINS[currentCoin].name) return;
  if(bestCoin===lastSwitchedCoin) return;
  const coinKey = Object.keys(COINS).find(k=>COINS[k].name===bestCoin);
  if(!coinKey) return;
  currentCoin=coinKey;
  document.getElementById("coin").value=coinKey;
  localStorage.setItem("coin",coinKey);
  prices=[]; lastSignal=""; entryPrice=null;
  lastSwitchedCoin=bestCoin;
  document.getElementById("signal").innerText="🔁 Auto switched to "+bestCoin;
  sendTelegram("🔁 AUTO SWITCH\nNew Coin: "+bestCoin+"\nConfidence: "+confScore+"%");
  getPrice();
}