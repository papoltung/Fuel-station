const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { spawn } = require("child_process");

const TOKEN = "MTUwNjQ5Nzc3OTMyMzYzNzc2MA.GSoA35.9XDAEzbBrlzBZBeCDU9hgPhmXwUTx8Gu4x7s7Q";
const CHANNEL_ID = "1506490944999133384";
const API_BASE = "http://localhost:3000";
const CF_EXE = "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe";

let tunnelProc = null;
let tunnelUrl = null;
let distillProc = null;
let distillUrl = null;

function makeTunnel(port, label, onUrl) {
  const proc = spawn(CF_EXE, ["tunnel", "--url", `http://localhost:${port}`], { windowsHide: true });
  proc.stderr.on("data", (data) => {
    const m = data.toString().match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (m) onUrl(m[0], proc);
  });
  return proc;
}

function startTunnel(channel) {
  if (tunnelProc) { channel.send("tunnel already running: " + (tunnelUrl ?? "starting...")); return; }
  tunnelUrl = null;
  tunnelProc = makeTunnel(3000, "pump", (url, proc) => {
    if (!tunnelUrl) { tunnelUrl = url; channel.send("pump online: " + url + "/dashboard"); }
    proc.on("exit", () => { tunnelProc = null; tunnelUrl = null; });
  });
}

function stopTunnel(channel) {
  if (!tunnelProc) { channel.send("tunnel not running"); return; }
  tunnelProc.kill(); tunnelProc = null; tunnelUrl = null;
  channel.send("pump tunnel stopped");
}

function startDistill(channel) {
  if (distillProc) { channel.send("distill already running: " + (distillUrl ?? "starting...")); return; }
  distillUrl = null;
  distillProc = makeTunnel(3001, "distill", (url, proc) => {
    if (!distillUrl) { distillUrl = url; channel.send("distillation online: " + url); }
    proc.on("exit", () => { distillProc = null; distillUrl = null; });
  });
}

function stopDistill(channel) {
  if (!distillProc) { channel.send("distill not running"); return; }
  distillProc.kill(); distillProc = null; distillUrl = null;
  channel.send("distill tunnel stopped");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// shared panel state
const panelState = { fuelHint: "b", payment: "cash" };

function buildPanel() {
  const fuelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("fuel_b").setLabel("เบนซิน 95").setStyle(panelState.fuelHint === "b" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fuel_d").setLabel("ดีเซล").setStyle(panelState.fuelHint === "d" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pay_cash").setLabel("สด").setStyle(panelState.payment === "cash" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("pay_transfer").setLabel("โอน").setStyle(panelState.payment === "transfer" ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("amt_50").setLabel("50").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_60").setLabel("60").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_80").setLabel("80").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_100").setLabel("100").setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("amt_150").setLabel("150").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_200").setLabel("200").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_300").setLabel("300").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_400").setLabel("400").setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("amt_500").setLabel("500").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_700").setLabel("700").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("amt_1000").setLabel("1000").setStyle(ButtonStyle.Secondary),
  );
  const fuelLabel = panelState.fuelHint === "b" ? "เบนซิน 95" : "ดีเซล";
  const payLabel = panelState.payment === "cash" ? "สด" : "โอน";
  const embed = new EmbedBuilder()
    .setTitle("บันทึกการขาย")
    .setDescription(`**${fuelLabel}** · **${payLabel}**\nกดยอดเงินที่ต้องการบันทึก`)
    .setColor(panelState.fuelHint === "b" ? 0x3B82F6 : 0xF59E0B);
  return { embeds: [embed], components: [fuelRow, row1, row2, row3] };
}

async function getFuelTypes() {
  const r = await fetch(`${API_BASE}/api/fuel-types`);
  return r.json();
}

function parseMsg(text) {
  const m = text.trim().match(/^(\d+)(d|b)?(t)?$/i);
  if (!m) return null;
  const amount = parseInt(m[1]);
  const fuelHint = (m[2] || "").toLowerCase();
  const payment = m[3] ? "transfer" : "cash";
  return { amount, fuelHint, payment };
}

client.on("ready", () => {
  console.log(`FuelBot ready: ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.channelId !== CHANNEL_ID) return;
  const { customId, user } = interaction;

  if (customId === "fuel_b" || customId === "fuel_d") {
    panelState.fuelHint = customId === "fuel_b" ? "b" : "d";
    await interaction.update(buildPanel());
    return;
  }
  if (customId === "pay_cash" || customId === "pay_transfer") {
    panelState.payment = customId === "pay_cash" ? "cash" : "transfer";
    await interaction.update(buildPanel());
    return;
  }
  if (customId.startsWith("amt_")) {
    const amount = parseInt(customId.split("_")[1]);
    try {
      const fuels = await getFuelTypes();
      const fuel = panelState.fuelHint === "d"
        ? fuels.find((f) => f.name === "diesel")
        : fuels.find((f) => f.name.startsWith("benzin"));
      if (!fuel) { await interaction.reply({ content: "ไม่พบชนิดน้ำมัน", ephemeral: true }); return; }
      const d = new Date();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      const res = await fetch(`${API_BASE}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr, sellerName: user.username, fuelTypeId: String(fuel.id),
          pumpNo: "หัวจ่าย 1", totalAmount: String(amount),
          pricePerLiter: String(fuel.currentPrice), paymentMethod: panelState.payment, customerName: "",
        }),
      });
      if (res.ok) {
        const liters = fuel.currentPrice > 0 ? (amount / fuel.currentPrice).toFixed(2) : "?";
        await interaction.reply({ content: `OK ${amount} บาท | ${fuel.label} | ${panelState.payment === "cash" ? "สด" : "โอน"} | ${liters} L`, ephemeral: true });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5 * 60 * 1000);
      } else {
        await interaction.reply({ content: "❌ บันทึกไม่สำเร็จ", ephemeral: true });
        setTimeout(() => interaction.deleteReply().catch(() => {}), 5 * 60 * 1000);
      }
    } catch (e) { console.error(e); await interaction.reply({ content: "❌", ephemeral: true }); }
    return;
  }
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (msg.channelId !== CHANNEL_ID) return;

  // tunnel commands
  const cmd = msg.content.trim().toLowerCase();
  if (cmd === "tunnel start")  { startTunnel(msg.channel);  await msg.delete().catch(() => {}); return; }
  if (cmd === "tunnel stop")   { stopTunnel(msg.channel);   await msg.delete().catch(() => {}); return; }
  if (cmd === "tunnel status") { msg.reply(tunnelProc ? "🟢 pump: " + (tunnelUrl ?? "starting...") : "🔴 pump stopped"); return; }
  if (cmd === "distill start")  { startDistill(msg.channel);  await msg.delete().catch(() => {}); return; }
  if (cmd === "distill stop")   { stopDistill(msg.channel);   await msg.delete().catch(() => {}); return; }
  if (cmd === "distill status") { msg.reply(distillProc ? "🟢 distill: " + (distillUrl ?? "starting...") : "🔴 distill stopped"); return; }

  // setup = ส่ง panel
  if (msg.content.trim().toLowerCase() === "setup") {
    await msg.channel.send(buildPanel());
    await msg.delete().catch(() => {});
    return;
  }

  // ราคา d 44.75
  const priceMatch = msg.content.trim().match(/^ราคา\s+(d|b)\s+(\d+(\.\d+)?)$/i);
  if (priceMatch) {
    const hint = priceMatch[1].toLowerCase();
    const newPrice = parseFloat(priceMatch[2]);
    try {
      const fuels = await getFuelTypes();
      const fuel = hint === "d" ? fuels.find((f) => f.name === "diesel") : fuels.find((f) => f.name.startsWith("benzin"));
      if (!fuel) { msg.react("❓"); return; }
      const res = await fetch(`${API_BASE}/api/fuel-types/${fuel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPrice: newPrice }),
      });
      if (res.ok) msg.reply(`อัพราคา ${fuel.label} -> ${newPrice} บาท/ลิตร`);
      else msg.react("❌");
    } catch (e) { msg.react("❌"); }
    return;
  }

  // del = ลบ sale ล่าสุดวันนี้
  if (msg.content.trim().toLowerCase() === "del") {
    try {
      const today = new Date().toISOString().split("T")[0];
      const r = await fetch(`${API_BASE}/api/sales?date=${today}`);
      const sales = await r.json();
      if (!sales.length) { msg.reply("ไม่มีรายการ"); return; }
      const last = sales[0];
      const del = await fetch(`${API_BASE}/api/sales/${last.id}`, { method: "DELETE" });
      if (del.ok) msg.reply(`ลบแล้ว: ${last.totalAmount} บาท | ${last.fuelType?.label ?? ""}`);
      else msg.react("❌");
    } catch (e) { msg.react("❌"); }
    return;
  }

  // number command: 100, 100d, 100bt
  const parsed = parseMsg(msg.content);
  if (!parsed) return;
  const { amount, fuelHint, payment } = parsed;
  try {
    const fuels = await getFuelTypes();
    let fuel;
    if (fuelHint === "d") fuel = fuels.find((f) => f.name === "diesel");
    else if (fuelHint === "b") fuel = fuels.find((f) => f.name.startsWith("benzin"));
    else fuel = fuels[0];
    if (!fuel) { msg.react("❓"); return; }
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    const res = await fetch(`${API_BASE}/api/sales`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateStr, sellerName: msg.author.username, fuelTypeId: String(fuel.id),
        pumpNo: "หัวจ่าย 1", totalAmount: String(amount),
        pricePerLiter: String(fuel.currentPrice), paymentMethod: payment, customerName: "",
      }),
    });
    if (res.ok) {
      const liters = fuel.currentPrice > 0 ? (amount / fuel.currentPrice).toFixed(2) : "?";
      msg.reply(`OK ${amount} บาท | ${fuel.label} | ${payment === "cash" ? "สด" : "โอน"} | ${liters} L`);
    } else { msg.react("❌"); }
  } catch (e) { console.error(e); msg.react("❌"); }
});

client.login(TOKEN);
