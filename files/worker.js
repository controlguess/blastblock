// why are you here?
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('blast_block_token');
    const headers = options.headers || {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    options.headers = headers;

    const res = await fetch(url, options);
    
    if (res.status === 401) {
        localStorage.removeItem('blast_block_token');
        localStorage.removeItem('blast_block_profile');
        localStorage.removeItem('block_blast_coins');
        localStorage.removeItem('block_blast_highscore');
        window.location.reload();
        return null;
    }

    return res;
}

const GRID_SIZE = 8;
let score = 0;
let highScore = parseInt(localStorage.getItem('block_blast_highscore') || '0', 10);
let coins = parseInt(localStorage.getItem('block_blast_coins') || '0', 10);
let streak = 0;
let maxStreak = 0;
let totalLinesCleared = 0;
let totalBlocksPlaced = 0;
let soundEnabled = true;

let activeTheme = localStorage.getItem('block_blast_theme') || 'default';
let activeFrame = localStorage.getItem('block_blast_frame') || 'frame-none';

let grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
let dockShapes = [null, null, null];
let draggingSlotIndex = null;
let activeDragShape = null;

let SHOP_DATA = { themes: [], frames: [] };

const SHOP_FALLBACKS = {
    themes: {
        'default': { id: 'default', name: 'Deep Space', cost: 0, class: '' },
        'neon': { id: 'neon', name: 'Cyber Neon', cost: 150, class: 'theme-neon' },
        'emerald': { id: 'emerald', name: 'Emerald Forest', cost: 300, class: 'theme-emerald' },
        'sunset': { id: 'sunset', name: 'Sunset Glow', cost: 500, class: 'theme-sunset' }
    },
    frames: {
        'frame-none': { id: 'frame-none', name: 'Standard Border', cost: 0, class: 'frame-none' },
        'frame-gold': { id: 'frame-gold', name: 'Golden Aura', cost: 200, class: 'frame-gold' },
        'frame-neon': { id: 'frame-neon', name: 'Pink Neon Ring', cost: 350, class: 'frame-neon' },
        'frame-diamond': { id: 'frame-diamond', name: 'Diamond Glow', cost: 600, class: 'frame-diamond' }
    }
};

async function fetchShopCatalog() {
    try {
        const res = await fetch('https://testing.blastblock.space/api/shop');
        const json = await res.json();
        if (json.success) {
            SHOP_DATA = json.shop;
        }
    } catch (err) {
        SHOP_DATA = {
            themes: Object.values(SHOP_FALLBACKS.themes),
            frames: Object.values(SHOP_FALLBACKS.frames)
        };
    }
}

const SHAPES_CONFIG = [
    { matrix: [[1]], color: 'color-cyan' },
    { matrix: [[1, 1], [1, 1]], color: 'color-yellow' },
    { matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: 'color-orange' },
    { matrix: [[1, 1]], color: 'color-cyan' },
    { matrix: [[1, 1, 1]], color: 'color-blue' },
    { matrix: [[1, 1, 1, 1]], color: 'color-purple' },
    { matrix: [[1, 1, 1, 1, 1]], color: 'color-red' },
    { matrix: [[1], [1]], color: 'color-cyan' },
    { matrix: [[1], [1], [1]], color: 'color-blue' },
    { matrix: [[1], [1], [1], [1]], color: 'color-purple' },
    { matrix: [[1], [1], [1], [1], [1]], color: 'color-red' },
    { matrix: [[1, 0], [1, 0], [1, 1]], color: 'color-green' },
    { matrix: [[0, 1], [0, 1], [1, 1]], color: 'color-green' },
    { matrix: [[1, 1, 1], [1, 0, 0]], color: 'color-green' },
    { matrix: [[1, 1, 1], [0, 0, 1]], color: 'color-green' },
    { matrix: [[1, 0], [1, 1]], color: 'color-orange' },
    { matrix: [[0, 1], [1, 1]], color: 'color-orange' },
    { matrix: [[1, 1], [1, 0]], color: 'color-orange' },
    { matrix: [[1, 1], [0, 1]], color: 'color-orange' },
    { matrix: [[1, 1, 1], [0, 1, 0]], color: 'color-purple' },
    { matrix: [[0, 1, 0], [1, 1, 1]], color: 'color-purple' }
];

class AudioFX {
    constructor() { this.ctx = null; }
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    playPlace() {
        if (!soundEnabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
    }
    playClear(combo = 1) {
        if (!soundEnabled) return;
        this.init();
        const baseFreq = 440 + (combo * 100);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, this.ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.25);
    }
    playGameOver() {
        if (!soundEnabled) return;
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    }
}
const sfx = new AudioFX();

const gridContainer = document.getElementById('grid-container');
const scoreDisplay = document.getElementById('score-display');
const highScoreDisplay = document.getElementById('high-score-display');
const streakDisplay = document.getElementById('streak-display');
const statCoins = document.getElementById('stat-coins');
const statMaxStreak = document.getElementById('stat-max-streak');
const statLinesCleared = document.getElementById('stat-lines-cleared');
const statBlocksPlaced = document.getElementById('stat-blocks-placed');
const dragGhost = document.getElementById('drag-ghost');
const soundToggleBtn = document.getElementById('btn-sound-toggle');
const soundToggleDot = document.getElementById('sound-toggle-dot');
const restartBtn = document.getElementById('btn-restart-game');
const modalRestartBtn = document.getElementById('btn-modal-restart');
const gameOverModal = document.getElementById('game-over-modal');

const btnToggleMenu = document.getElementById('btn-toggle-menu');
const topSlideMenu = document.getElementById('top-slide-menu');
const btnShop = document.getElementById('btn-shop');
const shopModal = document.getElementById('shop-modal');
const shopClose = document.getElementById('shop-close');
const shopTabThemes = document.getElementById('shop-tab-themes');
const shopTabFrames = document.getElementById('shop-tab-frames');
const shopSubtabStore = document.getElementById('shop-subtab-store');
const shopSubtabInventory = document.getElementById('shop-subtab-inventory');
const shopItemsContainer = document.getElementById('shop-items-container');
const shopCoinsDisplay = document.getElementById('shop-coins-display');

let activeShopTab = 'themes';
let activeShopSubTab = 'store';

btnToggleMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    topSlideMenu.classList.toggle('open');
    topSlideMenu.classList.toggle('closed');
});

window?.addEventListener('click', (e) => {
    if (!topSlideMenu.contains(e.target) && !btnToggleMenu.contains(e.target)) {
        topSlideMenu.classList.add('closed');
        topSlideMenu.classList.remove('open');
    }
});

btnShop?.addEventListener('click', () => {
    shopModal.classList.remove('hidden');
    renderShopItems();
});
shopClose?.addEventListener('click', () => shopModal.classList.add('hidden'));
shopModal?.addEventListener('click', e => { if (e.target === shopModal) shopModal.classList.add('hidden'); });

shopTabThemes?.addEventListener('click', () => {
    activeShopTab = 'themes';
    shopTabThemes.className = 'flex-1 py-1.5 font-bold text-xs rounded-lg bg-emerald-500/30 text-emerald-300 transition';
    shopTabFrames.className = 'flex-1 py-1.5 font-bold text-xs text-slate-400 rounded-lg transition';
    renderShopItems();
});

shopTabFrames?.addEventListener('click', () => {
    activeShopTab = 'frames';
    shopTabFrames.className = 'flex-1 py-1.5 font-bold text-xs rounded-lg bg-emerald-500/30 text-emerald-300 transition';
    shopTabThemes.className = 'flex-1 py-1.5 font-bold text-xs text-slate-400 rounded-lg transition';
    renderShopItems();
});

shopSubtabStore?.addEventListener('click', () => {
    activeShopSubTab = 'store';
    shopSubtabStore.className = 'flex-1 py-1 font-bold rounded-lg bg-cyan-500/30 text-cyan-300 transition';
    shopSubtabInventory.className = 'flex-1 py-1 font-bold rounded-lg text-slate-400 transition';
    renderShopItems();
});

shopSubtabInventory?.addEventListener('click', () => {
    activeShopSubTab = 'inventory';
    shopSubtabInventory.className = 'flex-1 py-1 font-bold rounded-lg bg-cyan-500/30 text-cyan-300 transition';
    shopSubtabStore.className = 'flex-1 py-1 font-bold rounded-lg text-slate-400 transition';
    renderShopItems();
});

function renderShopItems() {
    shopCoinsDisplay.textContent = coins.toLocaleString();
    shopItemsContainer.innerHTML = '';

    const catalogItems = SHOP_DATA[activeShopTab] || [];
    const unlockedList = userProfile?.unlocked_items || ['default', 'frame-none'];

    let itemsToRender = [];

    if (activeShopSubTab === 'store') {
        itemsToRender = catalogItems.filter(item => item.cost > 0 && !unlockedList.includes(item.id));
    } else {
        const fallbackMap = SHOP_FALLBACKS[activeShopTab];
        itemsToRender = unlockedList.map(id => {
            let found = catalogItems.find(i => i.id === id);
            if (!found && fallbackMap[id]) found = fallbackMap[id];
            return found;
        }).filter(Boolean);
    }

    if (itemsToRender.length === 0) {
        shopItemsContainer.innerHTML = `
            <div class="col-span-full py-12 flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                <i class="fa-solid fa-box-open text-3xl text-slate-500"></i>
                <p class="text-xs font-semibold">${activeShopSubTab === 'store' ? 'No new items available in store right now.' : 'You have not unlocked any items in this category yet.'}</p>
            </div>
        `;
        return;
    }

    itemsToRender.forEach(item => {
        const isOwned = item.cost === 0 || unlockedList.includes(item.id);
        const isEquipped = activeShopTab === 'themes' ? activeTheme === item.id : activeFrame === item.id;

        const card = document.createElement('div');
        card.className = 'bg-slate-900/80 p-4 rounded-2xl border border-white/10 flex flex-col justify-between gap-3';
        card.innerHTML = `
            <div class="flex flex-col gap-1">
                <span class="font-bold text-sm text-white">${item.name}</span>
                <span class="text-xs text-slate-400">${isOwned ? 'Owned' : `${item.cost} Coins`}</span>
            </div>
            <button class="shop-item-btn w-full py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                isEquipped 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                    : isOwned 
                        ? 'bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-300 border border-cyan-400/50'
                        : coins >= item.cost 
                            ? 'bg-amber-500/30 hover:bg-amber-500/50 text-amber-300 border border-amber-400/50'
                            : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
            }">
                ${isEquipped ? 'EQUIPPED' : isOwned ? 'EQUIP' : 'BUY'}
            </button>
        `;

        const btn = card.querySelector('.shop-item-btn');
        if (!isEquipped) {
            btn?.addEventListener('click', () => handleShopAction(item, isOwned));
        }

        shopItemsContainer.appendChild(card);
    });
}

async function handleShopAction(item, isOwned) {
    if (!isOwned) {
        if (coins < item.cost) return;
        coins -= item.cost;
        localStorage.setItem('block_blast_coins', coins.toString());
        const unlocked = userProfile?.unlocked_items || ['default', 'frame-none'];
        if (!unlocked.includes(item.id)) unlocked.push(item.id);
        if (userProfile) userProfile.unlocked_items = unlocked;
    }

    if (activeShopTab === 'themes') {
        activeTheme = item.id;
        localStorage.setItem('block_blast_theme', activeTheme);
        applyTheme();
    } else {
        activeFrame = item.id;
        localStorage.setItem('block_blast_frame', activeFrame);
        applyFrame();
    }

    updateScoreDisplays();
    renderShopItems();

    await syncProfileData({
        coins: coins,
        active_theme: activeTheme,
        active_frame: activeFrame,
        unlocked_items: userProfile?.unlocked_items || ['default', 'frame-none']
    });
}

function applyTheme() {
    document.body.className = 'h-screen w-screen overflow-hidden text-white flex justify-center items-center ' + (activeTheme !== 'default' ? `theme-${activeTheme}` : '');
}

function applyFrame() {
    const avatarBoxMenu = document.getElementById('account-avatar-container');
    const avatarBoxDetail = document.getElementById('detail-avatar-container');

    ['frame-none', 'frame-gold', 'frame-neon', 'frame-diamond'].forEach(f => {
        avatarBoxMenu.classList.remove(f);
        if (avatarBoxDetail) avatarBoxDetail.classList.remove(f);
    });

    avatarBoxMenu.classList.add(activeFrame);
    if (avatarBoxDetail) avatarBoxDetail.classList.add(activeFrame);
}

const particleCanvas = document.getElementById('particle-canvas');
const pCtx = particleCanvas.getContext('2d');
let particles = [];

function resizeParticleCanvas() {
    if (!gridContainer) return;
    const rect = gridContainer.getBoundingClientRect();
    particleCanvas.width = rect.width;
    particleCanvas.height = rect.height;
}

window?.addEventListener('resize', resizeParticleCanvas);
setTimeout(resizeParticleCanvas, 100);

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.size = Math.random() * 6 + 3;
        this.color = color;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.02;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.restore();
    }
}

function createParticlesAtCell(r, c) {
    const slot = getSlotDOM(r, c);
    if (!slot) return;
    const slotRect = slot.getBoundingClientRect();
    const gridRect = gridContainer.getBoundingClientRect();
    const x = slotRect.left - gridRect.left + slotRect.width / 2;
    const y = slotRect.top - gridRect.top + slotRect.height / 2;

    for (let i = 0; i < 8; i++) {
        particles.push(new Particle(x, y, '#00f2fe'));
        particles.push(new Particle(x, y, '#fff966'));
    }
}

function animateParticles() {
    pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(pCtx);
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
    requestAnimationFrame(animateParticles);
}
requestAnimationFrame(animateParticles);

function initGridDOM() {
    gridContainer.innerHTML = '';
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const slot = document.createElement('div');
            slot.className = 'grid-slot w-full h-full relative flex items-center justify-center';
            slot.dataset.row = r;
            slot.dataset.col = c;
            gridContainer.appendChild(slot);
        }
    }
}

function getSlotDOM(r, c) { return gridContainer.children[r * GRID_SIZE + c]; }

function renderGrid() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const slot = getSlotDOM(r, c);
            const colorClass = grid[r][c];
            const existingBlock = slot.querySelector('.block-cell');
            if (existingBlock) slot.removeChild(existingBlock);

            if (colorClass) {
                const block = document.createElement('div');
                block.className = `block-cell ${colorClass} w-full h-full`;
                slot.appendChild(block);
            }
        }
    }
}

function getRandomShape() {
    const index = Math.floor(Math.random() * SHAPES_CONFIG.length);
    return JSON.parse(JSON.stringify(SHAPES_CONFIG[index]));
}

function fillDockSlots() {
    const dockSlots = document.querySelectorAll('.dock-slot');
    dockSlots.forEach((slot, index) => {
        if (!dockShapes[index]) dockShapes[index] = getRandomShape();
        renderDockSlot(slot, dockShapes[index]);
    });
    checkGameOverCondition();
}

function renderDockSlot(container, shape) {
    container.innerHTML = '';
    if (!shape) return;

    const matrix = shape.matrix;
    const rows = matrix.length;
    const cols = matrix[0].length;

    const wrapper = document.createElement('div');
    wrapper.className = `grid gap-1 pointer-events-none transition-transform duration-200`;
    wrapper.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    const cellSize = Math.min(24, 95 / Math.max(rows, cols));

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            if (matrix[r][c] === 1) cell.className = `block-cell ${shape.color}`;
            wrapper.appendChild(cell);
        }
    }
    container.appendChild(wrapper);
    gsap.fromTo(wrapper, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' });
}

function canPlaceShape(shape, startRow, startCol) {
    const matrix = shape.matrix;
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
            if (matrix[r][c] === 1) {
                const targetR = startRow + r;
                const targetC = startCol + c;
                if (targetR < 0 || targetR >= GRID_SIZE || targetC < 0 || targetC >= GRID_SIZE) return false;
                if (grid[targetR][targetC] !== null) return false;
            }
        }
    }
    return true;
}

function placeShape(shape, startRow, startCol) {
    const matrix = shape.matrix;
    let blockCount = 0;

    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
            if (matrix[r][c] === 1) {
                grid[startRow + r][startCol + c] = shape.color;
                blockCount++;
            }
        }
    }

    score += blockCount * 10;
    totalBlocksPlaced += blockCount;
    sfx.playPlace();
    renderGrid();

    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
            if (matrix[r][c] === 1) {
                const slot = getSlotDOM(startRow + r, startCol + c);
                const block = slot.querySelector('.block-cell');
                if (block) gsap.fromTo(block, { scale: 0.7 }, { scale: 1, duration: 0.15, ease: 'back.out(2)' });
            }
        }
    }

    checkAndClearLines();
    updateScoreDisplays();
}

function checkAndClearLines() {
    const fullRows = [];
    const fullCols = [];

    for (let r = 0; r < GRID_SIZE; r++) {
        if (grid[r].every(cell => cell !== null)) fullRows.push(r);
    }
    for (let c = 0; c < GRID_SIZE; c++) {
        let isFull = true;
        for (let r = 0; r < GRID_SIZE; r++) {
            if (grid[r][c] === null) { isFull = false; break; }
        }
        if (isFull) fullCols.push(c);
    }

    const linesCleared = fullRows.length + fullCols.length;

    if (linesCleared > 0) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
        totalLinesCleared += linesCleared;

        coins += linesCleared * 10 + (streak > 1 ? streak * 5 : 0);
        localStorage.setItem('block_blast_coins', coins.toString());

        fullRows.forEach(r => { for (let c = 0; c < GRID_SIZE; c++) createParticlesAtCell(r, c); });
        fullCols.forEach(c => { for (let r = 0; r < GRID_SIZE; r++) createParticlesAtCell(r, c); });

        const baseLineScore = linesCleared * 100;
        const comboBonus = linesCleared > 1 ? linesCleared * 150 : 0;
        const streakBonus = streak > 1 ? streak * 50 : 0;
        score += (baseLineScore + comboBonus + streakBonus);

        sfx.playClear(streak);

        const slotsToClear = new Set();
        fullRows.forEach(r => { for (let c = 0; c < GRID_SIZE; c++) slotsToClear.add(`${r},${c}`); });
        fullCols.forEach(c => { for (let r = 0; r < GRID_SIZE; r++) slotsToClear.add(`${r},${c}`); });

        slotsToClear.forEach(coord => {
            const [r, c] = coord.split(',').map(Number);
            const slot = getSlotDOM(r, c);
            const block = slot.querySelector('.block-cell');
            if (block) {
                gsap.to(block, {
                    scale: 1.3, opacity: 0, duration: 0.2, ease: 'power2.out',
                    onComplete: () => { grid[r][c] = null; renderGrid(); }
                });
            } else {
                grid[r][c] = null;
            }
        });

        if (linesCleared >= 2 || streak >= 3) {
            confetti({ particleCount: 60 * linesCleared, spread: 70, origin: { y: 0.6 } });
            showComboEffect(linesCleared, streak);
        }
    } else {
        streak = 0;
    }

    updateScoreDisplays();
}

function showComboEffect(lines, comboStreak) {
    const container = document.getElementById('combo-floating-container');
    const comboEl = document.createElement('div');
    comboEl.className = 'absolute font-black italic tracking-widest pointer-events-none z-40 flex flex-col items-center justify-center';

    let comboTitle = `COMBO ${comboStreak}!`;
    if (lines >= 3) comboTitle = `SUPER BLAST!`;
    if (comboStreak >= 4) comboTitle = `EXCELLENT!!`;

    comboEl.innerHTML = `<span class="text-4xl lg:text-6xl text-white combo-glow font-black drop-shadow-2xl uppercase">${comboTitle}</span>`;
    container.appendChild(comboEl);

    gsap.fromTo(comboEl, 
        { scale: 0.2, y: 30, opacity: 0 }, 
        { scale: 1.25, y: -20, opacity: 1, duration: 0.35, ease: 'back.out(2.2)', onComplete: () => {
            gsap.to(comboEl, { scale: 1, y: -60, opacity: 0, duration: 0.45, delay: 0.35, ease: 'power2.in', onComplete: () => {
                if (comboEl.parentNode) comboEl.parentNode.removeChild(comboEl);
            }});
        }}
    );
}

function updateScoreDisplays() {
    scoreDisplay.textContent = score.toLocaleString();
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('block_blast_highscore', highScore.toString());
    }

    highScoreDisplay.textContent = highScore.toLocaleString();
    streakDisplay.textContent = streak;
    statCoins.textContent = coins.toLocaleString();
    statMaxStreak.textContent = maxStreak;
    statLinesCleared.textContent = totalLinesCleared;
    statBlocksPlaced.textContent = totalBlocksPlaced;
}

function checkGameOverCondition() {
    let canMoveAny = false;
    for (let i = 0; i < dockShapes.length; i++) {
        const shape = dockShapes[i];
        if (!shape) continue;

        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (canPlaceShape(shape, r, c)) { canMoveAny = true; break; }
            }
            if (canMoveAny) break;
        }
        if (canMoveAny) break;
    }

    if (dockShapes.every(s => s === null)) canMoveAny = true;
    if (!canMoveAny) setTimeout(triggerGameOver, 400);
}

function triggerGameOver() {
    sfx.playGameOver();
    document.getElementById('go-final-score').textContent = score.toLocaleString();
    document.getElementById('go-high-score').textContent = highScore.toLocaleString();
    
    const badge = document.getElementById('new-highscore-badge');
    if (score >= highScore && score > 0) {
        badge.classList.remove('hidden');
        confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
    } else {
        badge.classList.add('hidden');
    }

    syncGameOverStats(score, maxStreak);

    gameOverModal.classList.remove('opacity-0', 'pointer-events-none');
    const content = document.getElementById('game-over-content');
    content.classList.remove('scale-90');
    content.classList.add('scale-100');
}

async function syncGameOverStats(finalScore, gameMaxStreak) {
    const token = localStorage.getItem('blast_block_token');
    if (!token) return;
    try {
        const res = await authenticatedFetch('https://testing.blastblock.space/api/user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                action: 'submit_game',
                game_score: finalScore,
                game_streak: gameMaxStreak,
                coins: coins
            })
        });
        if (!res) return;
        const json = await res.json();
        if (json.success) {
            userProfile = { ...userProfile, ...json.profile };
            localStorage.setItem('blast_block_profile', JSON.stringify(userProfile));
            updateUIState();
        }
    } catch (err) {}
}

function initDragControls() {
    const dockSlots = document.querySelectorAll('.dock-slot');
    dockSlots.forEach(slot => {
        slot?.addEventListener('mousedown', handleDragStart);
        slot?.addEventListener('touchstart', handleDragStart, { passive: false });
    });

    window?.addEventListener('mousemove', handleDragMove);
    window?.addEventListener('touchmove', handleDragMove, { passive: false });
    window?.addEventListener('mouseup', handleDragEnd);
    window?.addEventListener('touchend', handleDragEnd);
}

function handleDragStart(e) {
    const slotIndex = parseInt(this.dataset.slotIndex, 10);
    const shape = dockShapes[slotIndex];
    if (!shape) return;

    if (e.type === 'touchstart') e.preventDefault();

    draggingSlotIndex = slotIndex;
    activeDragShape = shape;

    renderDragGhost(shape);
    updateGhostPosition(e);
    dragGhost.style.display = 'block';
    this.style.opacity = '0.3';
}

function renderDragGhost(shape) {
    dragGhost.innerHTML = '';
    const matrix = shape.matrix;
    const gridEl = document.createElement('div');
    gridEl.className = 'grid gap-1';
    gridEl.style.gridTemplateColumns = `repeat(${matrix[0].length}, minmax(0, 1fr))`;

    const firstSlot = gridContainer.children[0];
    const slotWidth = firstSlot ? firstSlot.getBoundingClientRect().width : 40;

    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[0].length; c++) {
            const cell = document.createElement('div');
            cell.style.width = `${slotWidth}px`;
            cell.style.height = `${slotWidth}px`;
            if (matrix[r][c] === 1) cell.className = `block-cell ${shape.color}`;
            gridEl.appendChild(cell);
        }
    }
    dragGhost.appendChild(gridEl);
}

function updateGhostPosition(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const offsetY = e.touches ? -60 : 0;

    dragGhost.style.left = `${clientX}px`;
    dragGhost.style.top = `${clientY + offsetY}px`;
    updateBoardHighlights(clientX, clientY + offsetY);
}

function handleDragMove(e) {
    if (draggingSlotIndex === null) return;
    if (e.type === 'touchmove') e.preventDefault();
    updateGhostPosition(e);
}

function updateBoardHighlights(pointerX, pointerY) {
    clearBoardHighlights();
    if (!activeDragShape) return;

    const gridRect = gridContainer.getBoundingClientRect();
    const firstSlotRect = gridContainer.children[0].getBoundingClientRect();
    const slotSize = firstSlotRect.width;

    const relativeX = pointerX - gridRect.left - (activeDragShape.matrix[0].length * slotSize) / 2;
    const relativeY = pointerY - gridRect.top - (activeDragShape.matrix.length * slotSize) / 2;

    const startCol = Math.round(relativeX / slotSize);
    const startRow = Math.round(relativeY / slotSize);

    if (canPlaceShape(activeDragShape, startRow, startCol)) {
        for (let r = 0; r < activeDragShape.matrix.length; r++) {
            for (let c = 0; c < activeDragShape.matrix[0].length; c++) {
                if (activeDragShape.matrix[r][c] === 1) {
                    const slot = getSlotDOM(startRow + r, startCol + c);
                    if (slot) slot.classList.add('grid-slot-highlight');
                }
            }
        }
    }
}

function clearBoardHighlights() {
    const highlights = gridContainer.querySelectorAll('.grid-slot-highlight');
    highlights.forEach(el => el.classList.remove('grid-slot-highlight'));
}

function handleDragEnd(e) {
    if (draggingSlotIndex === null) return;

    const pointerX = parseFloat(dragGhost.style.left);
    const pointerY = parseFloat(dragGhost.style.top);

    const gridRect = gridContainer.getBoundingClientRect();
    const firstSlotRect = gridContainer.children[0].getBoundingClientRect();
    const slotSize = firstSlotRect.width;

    const relativeX = pointerX - gridRect.left - (activeDragShape.matrix[0].length * slotSize) / 2;
    const relativeY = pointerY - gridRect.top - (activeDragShape.matrix.length * slotSize) / 2;

    const startCol = Math.round(relativeX / slotSize);
    const startRow = Math.round(relativeY / slotSize);

    const slotDOM = document.querySelector(`.dock-slot[data-slot-index="${draggingSlotIndex}"]`);

    if (canPlaceShape(activeDragShape, startRow, startCol)) {
        placeShape(activeDragShape, startRow, startCol);
        dockShapes[draggingSlotIndex] = null;
        if (slotDOM) slotDOM.innerHTML = '';
        if (dockShapes.every(s => s === null)) fillDockSlots();
        else checkGameOverCondition();
    } else {
        if (slotDOM) slotDOM.style.opacity = '1';
    }

    dragGhost.style.display = 'none';
    clearBoardHighlights();
    draggingSlotIndex = null;
    activeDragShape = null;
}

function resetGame() {
    score = 0;
    streak = 0;
    grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    dockShapes = [null, null, null];

    renderGrid();
    fillDockSlots();
    updateScoreDisplays();

    gameOverModal.classList.add('opacity-0', 'pointer-events-none');
    const content = document.getElementById('game-over-content');
    content.classList.remove('scale-100');
    content.classList.add('scale-90');
}

soundToggleBtn?.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
        soundToggleBtn.classList.replace('bg-slate-700', 'bg-indigo-600');
        soundToggleDot.classList.replace('translate-x-0', 'translate-x-6');
    } else {
        soundToggleBtn.classList.replace('bg-indigo-600', 'bg-slate-700');
        soundToggleDot.classList.replace('translate-x-6', 'translate-x-0');
    }
});

restartBtn?.addEventListener('click', resetGame);
modalRestartBtn?.addEventListener('click', resetGame);

let authToken = localStorage.getItem('blast_block_token') || null;
let userProfile = JSON.parse(localStorage.getItem('blast_block_profile') || 'null');
let isSignUpMode = false;

const btnAccount = document.getElementById('btn-account');
const accountBtnLabel = document.getElementById('account-btn-label');
const accountAvatarImg = document.getElementById('account-avatar-img');
const accountIconFallback = document.getElementById('account-icon-fallback');

const authModal = document.getElementById('auth-modal');
const authClose = document.getElementById('auth-close');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authMsg = document.getElementById('auth-msg');

const authLoggedOutView = document.getElementById('auth-logged-out-view');
const authLoggedInView = document.getElementById('auth-logged-in-view');

const detailAvatarImg = document.getElementById('detail-avatar-img');
const detailAvatarFallback = document.getElementById('detail-avatar-fallback');
const detailUsernameDisplay = document.getElementById('detail-username-display');
const detailEmailDisplay = document.getElementById('detail-email-display');
const detailLastLogin = document.getElementById('detail-last-login');

const displayRecordedHighscore = document.getElementById('display-recorded-highscore');
const displayRecordedMaxstreak = document.getElementById('display-recorded-maxstreak');

const profileEditForm = document.getElementById('profile-edit-form');
const editAvatarUrl = document.getElementById('edit-avatar-url');
const editUsername = document.getElementById('edit-username');
const btnLogout = document.getElementById('btn-logout');

function updateUIState() {
    applyTheme();
    applyFrame();

    authToken = localStorage.getItem('blast_block_token');

    if (authToken && userProfile) {
        accountBtnLabel.textContent = userProfile.username || 'User';
        coins = userProfile.coins !== undefined ? userProfile.coins : coins;
        localStorage.setItem('block_blast_coins', coins.toString());

        if (userProfile.active_theme) {
            activeTheme = userProfile.active_theme;
            localStorage.setItem('block_blast_theme', activeTheme);
            applyTheme();
        }

        if (userProfile.active_frame) {
            activeFrame = userProfile.active_frame;
            localStorage.setItem('block_blast_frame', activeFrame);
            applyFrame();
        }

        if (userProfile.avatar_url) {
            accountAvatarImg.src = userProfile.avatar_url;
            accountAvatarImg.classList.remove('hidden');
            accountIconFallback.classList.add('hidden');
            detailAvatarImg.src = userProfile.avatar_url;
            detailAvatarImg.classList.remove('hidden');
            detailAvatarFallback.classList.add('hidden');
        } else {
            accountAvatarImg.classList.add('hidden');
            accountIconFallback.classList.remove('hidden');
            detailAvatarImg.classList.add('hidden');
            detailAvatarFallback.classList.remove('hidden');
        }

        detailUsernameDisplay.textContent = userProfile.username || 'User';
        detailEmailDisplay.textContent = userProfile.email || 'Account Logged In';
        detailLastLogin.textContent = userProfile.last_login ? new Date(userProfile.last_login).toLocaleString() : 'Just now';

        displayRecordedHighscore.textContent = (userProfile.high_score || 0).toLocaleString();
        displayRecordedMaxstreak.textContent = (userProfile.highest_streak || 0).toLocaleString();

        editAvatarUrl.value = userProfile.avatar_url || '';
        editUsername.value = userProfile.username || '';

        authLoggedOutView.classList.add('hidden');
        authLoggedInView.classList.remove('hidden');
    } else {
        accountBtnLabel.textContent = 'Account';
        accountAvatarImg.classList.add('hidden');
        accountIconFallback.classList.remove('hidden');
        authLoggedOutView.classList.remove('hidden');
        authLoggedInView.classList.add('hidden');
    }
    updateScoreDisplays();
}

async function fetchProfile() {
    const token = localStorage.getItem('blast_block_token');
    if (!token) return;
    try {
        const res = await authenticatedFetch('https://testing.blastblock.space/api/user');
        if (!res) return;
        const json = await res.json();
        if (json.success) {
            userProfile = { ...json.profile, email: json.user.email };
            localStorage.setItem('blast_block_profile', JSON.stringify(userProfile));
            if (userProfile.high_score > highScore) {
                highScore = userProfile.high_score;
                localStorage.setItem('block_blast_highscore', highScore.toString());
            }
            updateUIState();
        }
    } catch (err) {}
}

async function syncProfileData(fields) {
    const token = localStorage.getItem('blast_block_token');
    if (!token) return;
    try {
        const res = await authenticatedFetch('https://testing.blastblock.space/api/user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(fields)
        });
        if (!res) return;
        const json = await res.json();
        if (json.success) {
            userProfile = { ...userProfile, ...json.profile };
            localStorage.setItem('blast_block_profile', JSON.stringify(userProfile));
            updateUIState();
        }
    } catch (err) {}
}

function setAuthMode(signUp) {
    isSignUpMode = signUp;
    authMsg.textContent = '';
    if (isSignUpMode) {
        tabSignup.classList.add('bg-cyan-500/30', 'text-cyan-300');
        tabSignup.classList.remove('text-slate-400');
        tabLogin.classList.remove('bg-cyan-500/30', 'text-cyan-300');
        tabLogin.classList.add('text-slate-400');
        authUsername.classList.remove('hidden');
        authSubmitBtn.textContent = 'CREATE ACCOUNT';
    } else {
        tabLogin.classList.add('bg-cyan-500/30', 'text-cyan-300');
        tabLogin.classList.remove('text-slate-400');
        tabSignup.classList.remove('bg-cyan-500/30', 'text-cyan-300');
        tabSignup.classList.add('text-slate-400');
        authUsername.classList.add('hidden');
        authSubmitBtn.textContent = 'LOG IN';
    }
}

btnAccount?.addEventListener('click', () => {
    authModal.classList.remove('hidden');
    updateUIState();
    authToken = localStorage.getItem('blast_block_token');
    if (authToken) fetchProfile();
});

authClose?.addEventListener('click', () => authModal.classList.add('hidden'));
authModal?.addEventListener('click', e => { if (e.target === authModal) authModal.classList.add('hidden'); });

tabLogin?.addEventListener('click', () => setAuthMode(false));
tabSignup?.addEventListener('click', () => setAuthMode(true));

authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMsg.textContent = 'Authenticating...';
    authMsg.className = 'text-xs text-center min-h-[1rem] text-cyan-300';

    try {
        const res = await fetch('https://testing.blastblock.space/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: isSignUpMode ? 'signup' : 'login',
                email: authEmail.value.trim(),
                password: authPassword.value,
                username: authUsername.value.trim()
            })
        });

        const json = await res.json();
        if (!res.ok || json.error) {
            authMsg.textContent = json.error || 'Authentication failed.';
            authMsg.className = 'text-xs text-center min-h-[1rem] text-red-400';
        } else {
            authToken = json.session?.access_token || null;
            if (authToken) localStorage.setItem('blast_block_token', authToken);
            authMsg.textContent = 'Success!';
            authMsg.className = 'text-xs text-center min-h-[1rem] text-green-400';
            await fetchProfile();
            setTimeout(() => authModal.classList.add('hidden'), 800);
        }
    } catch (err) {
        authMsg.textContent = 'Server connection failed.';
        authMsg.className = 'text-xs text-center min-h-[1rem] text-red-400';
    }
});

profileEditForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    authMsg.textContent = 'Saving updates...';
    authMsg.className = 'text-xs text-center min-h-[1rem] text-cyan-300';

    await syncProfileData({
        avatar_url: editAvatarUrl.value.trim(),
        username: editUsername.value.trim()
    });

    authMsg.textContent = 'Profile updated successfully!';
    authMsg.className = 'text-xs text-center min-h-[1rem] text-green-400';
});

btnLogout?.addEventListener('click', () => {
    localStorage.removeItem('blast_block_token');
    localStorage.removeItem('blast_block_profile');
    authToken = null;
    userProfile = null;
    updateUIState();
    authMsg.textContent = 'Logged out successfully.';
    authMsg.className = 'text-xs text-center min-h-[1rem] text-slate-400';
});

window.onload = async function() {
    initGridDOM();
    renderGrid();
    fillDockSlots();
    initDragControls();
    updateScoreDisplays();
    await fetchShopCatalog();
    updateUIState();
    authToken = localStorage.getItem('blast_block_token');
    if (authToken) fetchProfile();
};

window.BlastBlock = {
    shapes: SHAPES_CONFIG,
    get grid() { return grid; },
    get dock() { return dockShapes; },
    get score() { return score; },
    set score(v) { score = v; updateScoreDisplays(); },
    get streak() { return streak; },
    set streak(v) { streak = v; updateScoreDisplays(); },
    get coins() { return coins; },
    set coins(v) { coins = v; updateScoreDisplays(); },
    addShape(matrix, color) { SHAPES_CONFIG.push({ matrix, color }); },
    refresh() { renderGrid(); updateScoreDisplays(); },
    newDock() { dockShapes = [null, null, null]; fillDockSlots(); },
    restart: resetGame
};
