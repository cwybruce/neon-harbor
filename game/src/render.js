// The renderer: one canvas, a night neon harbour. The camera follows Jax (or drifts
// over the water on the title screen); the HUD, the minimap and the menus are drawn
// on the same canvas, so the screenshots show the whole game at a glance.

import { PALETTE, PLAYER, VIEW, WORLD } from './config.js';
import { hash2, isWaterAt } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r, color, filled) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function cameraFor(state, screen, time) {
    let cam;
    if (screen === SCREEN_TITLE) {
      // A slow drift over the harbour mouth.
      const t = time * 0.02;
      cam = {
        x: 1950 + Math.sin(t) * 260,
        y: 950 + Math.cos(t * 0.7) * 320,
      };
    } else {
      const p = state.player;
      cam = { x: p.x, y: p.y };
    }
    // Never show the void past the map edge.
    cam.x = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, cam.x));
    cam.y = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, cam.y));
    return cam;
  }

  let lastCam = { x: 0, y: 0 };

  function drawWorld(state, cam, time) {
    const vx = cam.x - VIEW.width / 2;
    const vy = cam.y - VIEW.height / 2;
    ctx.save();
    ctx.translate(-vx, -vy);

    const city = state.city;
    // Water: deep blue with slow neon streaks.
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(city.waterX, 0, city.width - city.waterX, city.height);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(city.waterX, 0, city.width - city.waterX, city.height);
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.16)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = ((i * 137 + Math.floor(time * 12)) % city.height);
      const x0 = city.waterX + 40 + ((i * 211) % 300);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + 120 + ((i * 53) % 160), y);
      ctx.stroke();
    }
    // Land.
    ctx.fillStyle = PALETTE.land;
    ctx.fillRect(0, 0, city.waterX, city.height);
    // The waterfront edge glows cyan.
    ctx.strokeStyle = PALETTE.neonCyan;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(city.waterX, 0);
    ctx.lineTo(city.waterX, city.height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsV) ctx.fillRect(rx - city.roadWidth / 2, 0, city.roadWidth, city.height);
    for (const ry of city.roadsH) ctx.fillRect(0, ry - city.roadWidth / 2, city.width, city.roadWidth);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 22]);
    for (const rx of city.roadsV) {
      ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, city.height); ctx.stroke();
    }
    for (const ry of city.roadsH) {
      ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(city.waterX, ry); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Piers: wooden decks over the water.
    for (const p of city.piers) {
      ctx.fillStyle = PALETTE.pier;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = PALETTE.pierEdge;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = 'rgba(255, 211, 25, 0.5)';
      ctx.lineWidth = 2;
      for (let x = p.x + 14; x < p.x + p.w - 10; x += 28) {
        ctx.beginPath(); ctx.moveTo(x, p.y + 4); ctx.lineTo(x, p.y + p.h - 4); ctx.stroke();
      }
    }

    // Container yard ground.
    ctx.fillStyle = '#1a1d2c';
    ctx.fillRect(city.yard.x, city.yard.y, city.yard.w, city.yard.h);
    ctx.strokeStyle = PALETTE.neonYellow;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(city.yard.x, city.yard.y, city.yard.w, city.yard.h);
    ctx.globalAlpha = 1;

    // Solids: containers and buildings.
    for (const s of city.solids) {
      if (s.kind === 'container') {
        ctx.fillStyle = PALETTE[s.color] || '#888';
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.beginPath();
        for (let x = s.x + 12; x < s.x + s.w - 6; x += 18) {
          ctx.moveTo(x, s.y + 4); ctx.lineTo(x, s.y + s.h - 4);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = PALETTE.building;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = PALETTE.buildingEdge;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        // Lit windows, deterministic per building.
        const cols = Math.max(2, Math.floor(s.w / 26));
        const rows = Math.max(2, Math.floor(s.h / 30));
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            const lit = hash2(s.seed, cx * 7 + cy * 13) < 0.4;
            ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDim;
            ctx.globalAlpha = lit ? 0.9 : 0.5;
            ctx.fillRect(s.x + 8 + cx * 26, s.y + 9 + cy * 30, 13, 16);
          }
        }
        ctx.globalAlpha = 1;
        // A neon roof sign on some buildings.
        if (hash2(s.seed, 99) < 0.5) {
          ctx.fillStyle = hash2(s.seed, 100) < 0.5 ? PALETTE.neonPink : PALETTE.neonCyan;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(s.x + s.w / 2 - 22, s.y - 6, 44, 6);
          ctx.globalAlpha = 1;
        }
      }
    }

    // The lighthouse, at the end of Pier 1.
    const lh = city.markers.lighthouse;
    ctx.fillStyle = '#e8e4d8';
    ctx.fillRect(lh.x - 8, lh.y - 26, 16, 52);
    ctx.fillStyle = PALETTE.neonYellow;
    ctx.beginPath();
    ctx.arc(lh.x, lh.y - 30, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 3);
    ctx.fillStyle = PALETTE.neonYellow;
    ctx.beginPath();
    ctx.moveTo(lh.x, lh.y - 30);
    ctx.lineTo(lh.x + 190, lh.y - 90);
    ctx.lineTo(lh.x + 190, lh.y + 30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'cash') {
        ctx.fillStyle = PALETTE.cash;
        ctx.fillRect(-9, -6, 18, 12);
        ctx.fillStyle = '#0a1c38';
        ctx.font = 'bold 11px ' + 'system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
      } else if (pk.kind === 'ammo') {
        ctx.fillStyle = PALETTE.neonYellow;
        ctx.fillRect(-8, -8, 16, 16);
        ctx.fillStyle = '#0a1c38';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('A', 0, 0);
      } else {
        ctx.fillStyle = '#ff5a5a';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      }
      ctx.restore();
    }

    // Boats.
    for (const b of state.boats) {
      if (b.wrecked) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(34, 0);
      ctx.quadraticCurveTo(20, -15, -28, -13);
      ctx.lineTo(-34, 0);
      ctx.lineTo(-28, 13);
      ctx.quadraticCurveTo(20, 15, 34, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(10,20,40,0.55)';
      ctx.fillRect(-8, -8, 18, 16);
      if (b.owner === 'police') {
        const on = Math.floor(time * 4) % 2 === 0;
        ctx.fillStyle = on ? PALETTE.policeRed : PALETTE.policeBlue;
        ctx.beginPath();
        ctx.arc(6, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Cars.
    for (const c of state.cars) {
      if (c.wrecked) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      const halfL = c.kind === 'truck' ? 34 : 26;
      const halfW = 13;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-halfL - 2, -halfW - 2, (halfL + 2) * 2, (halfW + 2) * 2);
      ctx.fillStyle = c.color;
      roundRect(ctx, -halfL, -halfW, halfL * 2, halfW * 2, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(180,220,255,0.75)';
      ctx.fillRect(halfL - 16, -halfW + 3, 10, halfW * 2 - 6);
      ctx.fillStyle = 'rgba(10,16,32,0.7)';
      ctx.fillRect(-6, -halfW + 3, 14, halfW * 2 - 6);
      if (c.kind === 'police') {
        const on = Math.floor(time * 4) % 2 === 0;
        ctx.fillStyle = on ? PALETTE.policeRed : PALETTE.policeBlue;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 14;
        ctx.fillRect(-4, -halfW - 2, 8, 5);
        ctx.shadowBlur = 0;
      }
      if (c.kind === 'truck') {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(-halfL + 4, -halfW + 3, 26, halfW * 2 - 6);
      }
      ctx.restore();
    }

    // Pedestrians and officers.
    for (const pd of state.peds) {
      if (pd.dead) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - pd.fade / 3);
        ctx.fillStyle = PALETTE.ped;
        ctx.beginPath();
        ctx.arc(pd.x, pd.y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = PALETTE.ped;
      ctx.beginPath();
      ctx.arc(pd.x, pd.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#141724';
      ctx.beginPath();
      ctx.arc(pd.x + Math.cos(pd.angle) * 4, pd.y + Math.sin(pd.angle) * 4, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const o of state.officers) {
      if (o.dead) continue;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);
      ctx.fillStyle = PALETTE.police;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a1c38';
      ctx.fillRect(6, -3, 12, 6);
      ctx.restore();
    }

    // The player.
    const p = state.player;
    if (!p.vehicle) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowColor = PALETTE.neonCyan;
      ctx.shadowBlur = 16;
      ctx.fillStyle = PALETTE.player;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.rotate(p.angle);
      ctx.fillStyle = '#0a1c38';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(4, -6);
      ctx.lineTo(4, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Effects.
    for (const e of state.effects) {
      const a = 1 - e.t / e.ttl;
      if (e.kind === 'flash') {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffe66d';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 10 * a + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'boom') {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 34 * (1 - a) + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd319';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 * (1 - a) + 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Mission target marker.
    if (!state.complete && state.missionTarget) {
      const t = state.missionTarget;
      const pulse = 1 + 0.15 * Math.sin(time * 4);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = PALETTE.neonYellow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(0, -18);
      ctx.moveTo(0, 34);
      ctx.lineTo(0, 18);
      ctx.moveTo(-34, 0);
      ctx.lineTo(-18, 0);
      ctx.moveTo(34, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.restore();
      // A beacon column so the target reads from far away.
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.fillRect(t.x - 8, t.y - 260, 16, 260);
      ctx.restore();
    }

    ctx.restore();
    return { vx, vy };
  }

  function drawMinimap(state, cam) {
    const mw = 220;
    const mh = 162;
    const mx = VIEW.width - mw - 16;
    const my = VIEW.height - mh - 16;
    const sx = mw / state.city.width;
    const sy = mh / state.city.height;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = PALETTE.land;
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(mx + state.city.waterX * sx, my, mw - state.city.waterX * sx, mh);
    ctx.strokeStyle = PALETTE.lane;
    ctx.lineWidth = 1;
    for (const rx of state.city.roadsV) {
      ctx.beginPath();
      ctx.moveTo(mx + rx * sx, my);
      ctx.lineTo(mx + rx * sx, my + mh);
      ctx.stroke();
    }
    for (const ry of state.city.roadsH) {
      ctx.beginPath();
      ctx.moveTo(mx, my + ry * sy);
      ctx.lineTo(mx + mw, my + ry * sy);
      ctx.stroke();
    }
    if (!state.complete && state.missionTarget) {
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.beginPath();
      ctx.arc(mx + state.missionTarget.x * sx, my + state.missionTarget.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of state.cars) {
      if (c.owner !== 'police' || c.wrecked) continue;
      ctx.fillStyle = PALETTE.policeRed;
      ctx.beginPath();
      ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = state.player;
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.beginPath();
    ctx.arc(mx + p.x * sx, my + p.y * sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(state, screen) {
    const p = state.player;
    ctx.save();
    // Cash and health, top left.
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 16, 14, 250, 64, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.cash;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${p.cash}`, 30, 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`AMMO ${p.ammo}`, 150, 36);
    ctx.fillStyle = '#2a3350';
    ctx.fillRect(30, 58, 180, 10);
    ctx.fillStyle = p.health > 30 ? PALETTE.cash : PALETTE.danger;
    ctx.fillRect(30, 58, 180 * Math.max(0, p.health / 100), 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${Math.max(0, Math.round(p.health))} HP`, 218, 63);

    // Wanted stars, top right.
    const level = Math.floor(state.wanted);
    for (let i = 0; i < 5; i++) {
      star(ctx, VIEW.width - 40 - i * 34, 40, 13, i < level ? PALETTE.neonYellow : '#3a4266', i < level);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('WANTED', VIEW.width - 40, 66);

    // Mission objective, top centre.
    if (!state.complete) {
      const mission = `JOB ${state.missionIndex + 1}/4 — ${state.missionStage === 'go' ? 'GO TO' : 'DELIVER TO'} ${state.missionTarget.label.toUpperCase()}`;
      ctx.font = 'bold 17px system-ui, sans-serif';
      const w = ctx.measureText(mission).width + 28;
      ctx.fillStyle = PALETTE.panel;
      roundRect(ctx, (VIEW.width - w) / 2, 14, w, 34, 8);
      ctx.fill();
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.textAlign = 'center';
      ctx.fillText(mission, VIEW.width / 2, 32);
      const t = Math.max(0, Math.ceil(state.missionTimer));
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillStyle = t <= 15 ? PALETTE.danger : PALETTE.text;
      ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, VIEW.width / 2, 62);
    } else {
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.cash;
      ctx.textAlign = 'center';
      ctx.fillText('ALL JOBS DONE', VIEW.width / 2, 32);
    }

    // Controls hint, bottom left.
    ctx.fillStyle = 'rgba(10, 14, 28, 0.6)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('WASD drive / walk · E enter car or boat · Click shoot · F punch · P pause · G save · L load', 18, VIEW.height - 18);

    // Banner from Mira.
    if (state.banner) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      const w = Math.min(760, ctx.measureText(state.banner.text).width + 36);
      ctx.fillStyle = 'rgba(10, 14, 28, 0.85)';
      roundRect(ctx, (VIEW.width - w) / 2, VIEW.height - 96, w, 40, 10);
      ctx.fill();
      ctx.strokeStyle = PALETTE.neonPink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffd7ef';
      ctx.textAlign = 'center';
      ctx.fillText(state.banner.text, VIEW.width / 2, VIEW.height - 75);
    }
    ctx.restore();
  }

  function drawScreen(state, screen, best) {
    ctx.save();
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(5, 8, 18, 0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.shadowColor = PALETTE.neonPink;
      ctx.shadowBlur = 30;
      ctx.fillStyle = PALETTE.neonPink;
      ctx.font = 'bold 96px system-ui, sans-serif';
      ctx.fillText('NEON HARBOR', VIEW.width / 2, 250);
      ctx.shadowBlur = 0;
      ctx.shadowColor = PALETTE.neonCyan;
      ctx.shadowBlur = 18;
      ctx.fillStyle = PALETTE.neonCyan;
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText('A NIGHT ON THE DOCKS', VIEW.width / 2, 300);
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.text;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Jax used to unload the ships. Tonight he drives for Mira —', VIEW.width / 2, 360);
      ctx.fillText('four jobs, one harbor, and every cop in the city.', VIEW.width / 2, 390);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillText('WASD drive & walk · E steal a car or boat · Mouse aim, click to shoot · F punch', VIEW.width / 2, 450);
      ctx.fillText('P pause · G save · L load · M mute', VIEW.width / 2, 478);
      const blink = Math.floor(performance.now() / 500) % 2 === 0;
      if (blink) {
        ctx.fillStyle = PALETTE.neonYellow;
        ctx.font = 'bold 24px system-ui, sans-serif';
        ctx.fillText('PRESS ENTER TO START', VIEW.width / 2, 540);
      }
      if (best > 0) {
        ctx.fillStyle = PALETTE.cash;
        ctx.font = '17px system-ui, sans-serif';
        ctx.fillText(`Best haul so far: $${best}`, VIEW.width / 2, 580);
      }
    } else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(5, 8, 18, 0.65)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('PAUSED', VIEW.width / 2, 330);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Press P or Enter to keep driving', VIEW.width / 2, 380);
    } else if (screen === SCREEN_BUSTED) {
      ctx.fillStyle = 'rgba(20, 4, 10, 0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.shadowColor = PALETTE.danger;
      ctx.shadowBlur = 26;
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 88px system-ui, sans-serif';
      ctx.fillText('BUSTED', VIEW.width / 2, 330);
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.text;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('The harbor police caught up with Jax. Mira bailed him out — $50 lighter.', VIEW.width / 2, 390);
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('PRESS ENTER TO GET BACK ON THE STREET', VIEW.width / 2, 450);
    } else if (screen === SCREEN_WASTED) {
      ctx.fillStyle = 'rgba(20, 4, 10, 0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.shadowColor = PALETTE.danger;
      ctx.shadowBlur = 26;
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 88px system-ui, sans-serif';
      ctx.fillText('WASTED', VIEW.width / 2, 330);
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.text;
      ctx.font = '20px system-ui, sans-serif';
      ctx.fillText('Jax went down on the docks. The clinic patched him up — $100 lighter.', VIEW.width / 2, 390);
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('PRESS ENTER TO TRY AGAIN', VIEW.width / 2, 450);
    } else if (screen === SCREEN_COMPLETE) {
      ctx.fillStyle = 'rgba(4, 18, 10, 0.72)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.textAlign = 'center';
      ctx.shadowColor = PALETTE.cash;
      ctx.shadowBlur = 26;
      ctx.fillStyle = PALETTE.cash;
      ctx.font = 'bold 72px system-ui, sans-serif';
      ctx.fillText('JOB COMPLETE', VIEW.width / 2, 320);
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALETTE.text;
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(`All four jobs done. Jax walks away with $${state.player.cash}.`, VIEW.width / 2, 380);
      ctx.fillText('Mira is already calling about the next harbor.', VIEW.width / 2, 412);
      ctx.fillStyle = PALETTE.neonYellow;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('PRESS ENTER TO PLAY AGAIN', VIEW.width / 2, 470);
    }
    ctx.restore();
  }

  return {
    // The camera the last draw used, so mouse aim can map screen to world.
    camera() { return lastCam; },
    draw(state, screen, best, time) {
      ctx.clearRect(0, 0, VIEW.width, VIEW.height);
      ctx.fillStyle = '#050812';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      const cam = cameraFor(state, screen, time);
      lastCam = cam;
      drawWorld(state, cam, time);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_COMPLETE) {
        drawMinimap(state, cam);
        drawHud(state, screen);
      }
      if (screen !== SCREEN_PLAY) drawScreen(state, screen, best);
    },
  };
}
