const form = document.getElementById('namesForm');
const namesInput = document.getElementById('names');
const spinBtn = document.getElementById('spinBtn');
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const winnerDisplay = document.getElementById('winnerDisplay');
const wheelFrame = document.querySelector('.wheel-frame');

let names = [];
let winner = '';
let spinning = false;
let currentRotation = 0;

// Global audio tracking
let activeSpinSound = null;
let activeAudioElements = [];
let pausedAudioElements = [];

// Override Audio constructor to track all audio elements
const OriginalAudio = window.Audio;
window.Audio = function(...args) {
    const audio = new OriginalAudio(...args);
    activeAudioElements.push(audio);
    audio.addEventListener('ended', () => {
        const index = activeAudioElements.indexOf(audio);
        if (index > -1) activeAudioElements.splice(index, 1);
    });
    return audio;
};

// Wheel colors - Blue, White, and Orange matching the theme
const WHEEL_COLORS = ['#2563a8', '#ffffff', '#fd9201'];

// Performance optimization: Off-screen canvas cache
let offscreenCanvas = null;
let offscreenCtx = null;
let cachedWheelImage = null;
let cacheValid = false;

// Secret winner mode state
let winnerModeActive = false;
let winnerInput = '';

// Winner sound alternation counter
let winnerSoundIndex = 0;

// Helper function to get color index ensuring no adjacent duplicates
function getColorIndex(segmentIndex, totalSegments) {
    const numColors = WHEEL_COLORS.length;
    
    // Simple sequential cycling through colors
    // This naturally prevents adjacent duplicates since we have 3 colors
    // With 3 colors: 0,1,2,0,1,2,0,1,2... no adjacent segments can be the same
    // Examples:
    // - 3 segments: Blue(0), White(1), Orange(2)
    // - 4 segments: Blue(0), White(1), Orange(2), Blue(0) - wraps to Blue(1)... wait that's wrong
    // - 6 segments: Blue(0), White(1), Orange(2), Blue(3%3=0), White(4%3=1), Orange(5%3=2)
    
    // Actually with 4 segments we get: 0,1,2,0 which means Blue(0)->White(1)->Orange(2)->Blue(0)
    // That's fine because segment 3 (Blue) is not next to segment 0 (Blue) visually... 
    // OH! segment 3 IS next to segment 0 because it wraps around!
    
    // We need to ensure (lastSegmentColor != firstSegmentColor)
    // If totalSegments % numColors == 1, we have a problem
    // Example: 4 segments with 3 colors: 0,1,2,0 - last(0) wraps to first(0) - PROBLEM!
    
    // Solution: When totalSegments % numColors == 1, skip color 0 on the last segment
    if (totalSegments % numColors === 1 && segmentIndex === totalSegments - 1) {
        // Last segment would be color 0, but first is also 0, so use color 1 instead
        return 1;
    }
    
    return segmentIndex % numColors;
}

// Create or update off-screen canvas cache
function createWheelCache() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 5;
    
    // Create off-screen canvas if it doesn't exist or size changed
    if (!offscreenCanvas || offscreenCanvas.width !== canvas.width || offscreenCanvas.height !== canvas.height) {
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCtx = offscreenCanvas.getContext('2d');
    }
    
    // Clear the off-screen canvas
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    if (names.length === 0) {
        // Draw empty wheel with 10 segments
        const segments = 10;
        const anglePerSegment = (2 * Math.PI) / segments;
        
        for (let i = 0; i < segments; i++) {
            const startAngle = i * anglePerSegment;
            const endAngle = startAngle + anglePerSegment;
            
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(centerX, centerY);
            offscreenCtx.arc(centerX, centerY, radius, startAngle, endAngle);
            offscreenCtx.closePath();
            
            const colorIndex = getColorIndex(i, segments);
            offscreenCtx.fillStyle = WHEEL_COLORS[colorIndex];
            offscreenCtx.fill();
            
            // Add subtle border between segments
            offscreenCtx.strokeStyle = 'rgba(0,0,0,0.1)';
            offscreenCtx.lineWidth = 1;
            offscreenCtx.stroke();
        }
    } else {
        const anglePerSegment = (2 * Math.PI) / names.length;
        
        // Performance: Determine level of detail for text rendering
        const shouldDrawText = names.length <= 100;
        const shouldDrawSomeText = names.length > 100 && names.length <= 300;
        const textInterval = shouldDrawSomeText ? Math.ceil(names.length / 50) : 1;
        
        for (let i = 0; i < names.length; i++) {
            const startAngle = i * anglePerSegment;
            const endAngle = startAngle + anglePerSegment;
            
            // Draw segment
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(centerX, centerY);
            offscreenCtx.arc(centerX, centerY, radius, startAngle, endAngle);
            offscreenCtx.closePath();
            
            const colorIndex = getColorIndex(i, names.length);
            offscreenCtx.fillStyle = WHEEL_COLORS[colorIndex];
            offscreenCtx.fill();
            
            // Add subtle border between segments
            offscreenCtx.strokeStyle = 'rgba(0,0,0,0.1)';
            offscreenCtx.lineWidth = 1;
            offscreenCtx.stroke();
            
            // Draw text with level-of-detail optimization
            if (shouldDrawText || (shouldDrawSomeText && i % textInterval === 0)) {
                offscreenCtx.save();
                offscreenCtx.translate(centerX, centerY);
                offscreenCtx.rotate(startAngle + anglePerSegment / 2);
                offscreenCtx.textAlign = 'right';
                // Text color contrasts with background: white text on blue/orange, blue text on white
                offscreenCtx.fillStyle = WHEEL_COLORS[colorIndex] === '#ffffff' ? '#2563a8' : '#ffffff';
                
                // Adjust font size based on number of segments
                const fontSize = names.length <= 50 ? 14 : names.length <= 100 ? 12 : 10;
                offscreenCtx.font = `bold ${fontSize}px Arial`;
                
                const maxChars = names.length <= 50 ? 15 : names.length <= 100 ? 10 : 8;
                offscreenCtx.fillText(names[i].substring(0, maxChars), radius - 20, 5);
                offscreenCtx.restore();
            }
        }
    }
    
    // Draw center circle gradient effect
    const gradient = offscreenCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.15)');
    
    offscreenCtx.beginPath();
    offscreenCtx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    offscreenCtx.fillStyle = gradient;
    offscreenCtx.fill();
    
    cacheValid = true;
}

// Draw the wheel using cached image and rotation
function drawWheel() {
    // Recreate cache if invalid
    if (!cacheValid) {
        createWheelCache();
    }
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Clear main canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Use CSS transform for rotation instead of redrawing
    // But for compatibility, we'll use canvas transform
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(currentRotation);
    ctx.translate(-centerX, -centerY);
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.restore();
}

// Listen for Backtick+Name shortcut (hold backtick while typing)
window.addEventListener('keydown', function(e) {
    if (e.key === '`') {
        if (!winnerModeActive) {
            winnerModeActive = true;
            winnerInput = '';
            console.log('Winner mode activated - type a name');
        }
        e.preventDefault();
    } else if (e.ctrlKey && e.key === '`') {
        // Prevent Ctrl+` conflicts
        e.preventDefault();
    }
});

window.addEventListener('keydown', function(e) {
    // Check if backtick is being held (by checking if it's in the active keys)
    const backtickHeld = e.getModifierState && e.getModifierState('Accel') === false; // Fallback detection
    
    if (winnerModeActive && e.key.length === 1 && e.key.match(/[a-z0-9]/i)) {
        winnerInput += e.key.toLowerCase();
        e.preventDefault();
    } else if (winnerModeActive && e.key === 'Backspace') {
        winnerInput = winnerInput.slice(0, -1);
        e.preventDefault();
    }
});

// Listen for when backtick is released
window.addEventListener('keyup', function(e) {
    if (e.key === '`' && winnerModeActive) {
        if (winnerInput.trim().length > 0) {
            const match = names.find(n => n.toLowerCase().includes(winnerInput.trim()));
            if (match) {
                winner = match;
                console.log('Winner set via keyboard to:', winner);
            }
        }
        winnerModeActive = false;
        winnerInput = '';
    }
});

// Secret winner setting: double-click canvas
canvas.addEventListener('dblclick', function(e) {
    if (!names.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2 - 10;
    if (x * x + y * y > radius * radius) return;
    
    let angle = Math.atan2(y, x);
    angle = -angle + Math.PI / 2;
    
    // Account for current rotation
    angle = angle - currentRotation;
    
    if (angle < 0) angle += 2 * Math.PI;
    
    const n = names.length;
    const anglePerSegment = 2 * Math.PI / n;
    const adjustedAngle = (angle + anglePerSegment / 2) % (2 * Math.PI);
    const index = Math.floor(adjustedAngle / anglePerSegment) % n;
    
    if (index >= 0 && index < n) {
        winner = names[index];
        console.log('Winner set to:', winner); // Debug message
    }
});

// Function to update names from input
function updateNamesFromInput() {
    let inputValue = namesInput.value;
    if (inputValue.includes('\n')) {
        names = inputValue.split('\n').map(n => n.trim()).filter(n => n);
    } else {
        names = inputValue.split(',').map(n => n.trim()).filter(n => n);
    }
    if (names.length === 0) {
        spinBtn.disabled = true;
    } else {
        spinBtn.disabled = false;
    }
    // Only clear winner if the name is truly removed from the list
    // Keep the winner if it still exists (even if names were just reordered or edited)
    if (winner && !names.includes(winner)) {
        winner = '';
    }
    // Invalidate cache when names change
    cacheValid = false;
    drawWheel();
}

// Update wheel automatically as user types
namesInput.addEventListener('input', function() {
    updateNamesFromInput();
});

// Also handle form submission
form.addEventListener('submit', function(e) {
    e.preventDefault();
    updateNamesFromInput();
});

spinBtn.addEventListener('click', function() {
    if (!spinning && names.length > 0) {
        playClickSound();
        let spinWinner = winner && names.includes(winner) ? winner : names[Math.floor(Math.random() * names.length)];
        spinToWinner(spinWinner);
    }
});

function spinToWinner(winnerName) {
    spinning = true;
    spinBtn.disabled = true;
    
    // Add glow effect to the frame
    wheelFrame.classList.add('spinning');
    
    // Start spinning sound
    const spinSound = playSpinningSound();
    activeSpinSound = spinSound;
    
    // Create sparkles during spin (reduced frequency for performance)
    const sparkleInterval = setInterval(() => {
        createSparkles();
    }, 150);
    
    const n = names.length;
    const winnerIndex = names.indexOf(winnerName);
    const anglePer = 2 * Math.PI / n;
    const randomRounds = 8 + Math.floor(Math.random() * 4);
    
    // Normalize current rotation to 0-2π range to prevent overflow issues
    let normalizedRotation = currentRotation % (2 * Math.PI);
    if (normalizedRotation < 0) normalizedRotation += 2 * Math.PI;
    
    // Calculate final angle so winner is at top (pointer position)
    const finalAngle = (3 * Math.PI / 2) - (winnerIndex * anglePer) - anglePer / 2;
    
    // Calculate shortest path to the final angle
    let targetAngle = finalAngle;
    while (targetAngle < normalizedRotation) {
        targetAngle += 2 * Math.PI;
    }
    
    const totalAngle = 2 * Math.PI * randomRounds + (targetAngle - normalizedRotation);
    const startRotation = normalizedRotation;
    let startTimestamp = null;
    const startTime = performance.now();
    const duration = 7000 + Math.random() * 1000;
    
    // Set a timeout to force-stop spinning sound after duration (works even when tab is hidden)
    const soundTimeout = setTimeout(() => {
        if (activeSpinSound) {
            activeSpinSound.stop();
            activeSpinSound = null;
        }
        clearInterval(sparkleInterval);
        wheelFrame.classList.remove('spinning');
        spinning = false;
        spinBtn.disabled = false;
        
        // Ensure final position is set
        const finalProgress = 1;
        const finalEase = 1 - Math.pow(1 - finalProgress, 3);
        currentRotation = startRotation + finalEase * totalAngle;
        currentRotation = currentRotation % (2 * Math.PI);
        if (currentRotation < 0) currentRotation += 2 * Math.PI;
        
        drawWheel();
        const degrees = (currentRotation * 180) / Math.PI;
        wheelFrame.style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
        
        setTimeout(() => {
            showWinner(winnerName);
        }, 300);
    }, duration + 100);
    
    console.log('Spinning to winner:', winnerName, 'at index:', winnerIndex); // Debug message
    
    // Performance optimization: Track last frame time to avoid unnecessary redraws
    let lastFrameTime = 0;
    const frameInterval = 1000 / 60; // Target 60 FPS

    function animateWheel(timestamp) {
        if (!startTimestamp) startTimestamp = timestamp;
        
        // Calculate elapsed time based on real time, not requestAnimationFrame timestamp
        const elapsed = performance.now() - startTime;
        
        // Throttle to 60 FPS max
        if (timestamp - lastFrameTime < frameInterval) {
            requestAnimationFrame(animateWheel);
            return;
        }
        lastFrameTime = timestamp;
        
        const progress = Math.min(1, elapsed / duration);
        
        // Smooth easing - cubic ease out for natural deceleration
        const ease = 1 - Math.pow(1 - progress, 3);
        
        currentRotation = startRotation + ease * totalAngle;
        drawWheel();
        
        // Rotate the frame along with the wheel
        const degrees = (currentRotation * 180) / Math.PI;
        wheelFrame.style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
        
        if (progress < 1) {
            requestAnimationFrame(animateWheel);
        } else {
            clearTimeout(soundTimeout);
            clearInterval(sparkleInterval);
            if (activeSpinSound) {
                spinSound.stop();
                activeSpinSound = null;
            }
            spinning = false;
            spinBtn.disabled = false;
            
            // Normalize rotation after spin to prevent number overflow
            currentRotation = currentRotation % (2 * Math.PI);
            if (currentRotation < 0) currentRotation += 2 * Math.PI;
            
            // Remove glow effect
            wheelFrame.classList.remove('spinning');
            
            setTimeout(() => {
                showWinner(winnerName);
            }, 300);
        }
    }
    requestAnimationFrame(animateWheel);
}

function showWinner(winnerName) {
    const modal = document.getElementById('winnerModal');
    const winnerNamePopup = document.getElementById('winnerNamePopup');
    winnerNamePopup.textContent = winnerName;
    modal.classList.add('show');
    
    // Play alternating winner sound
    playWinnerSound();
    
    // Auto-remove the winner from the list
    const winnerIndex = names.indexOf(winnerName);
    if (winnerIndex > -1) {
        names.splice(winnerIndex, 1);
        // Update the textarea to reflect the removal
        namesInput.value = names.join('\n');
        // Invalidate cache when names change
        cacheValid = false;
        // Redraw the wheel with remaining names
        drawWheel();
    }
}

function playWinnerSound() {
    // Alternate between the two winner sound effects
    const soundFiles = ['sfx/win1.mp3', 'sfx/win2.mp3'];
    const audio = new Audio(soundFiles[winnerSoundIndex]);
    audio.volume = 0.7;
    
    console.log('Attempting to play:', soundFiles[winnerSoundIndex]);
    
    audio.play().then(() => {
        console.log('Sound played successfully');
    }).catch(error => {
        console.error('Error playing sound:', error);
        // Try to play without promise handling for older browsers
        try {
            audio.play();
        } catch (e) {
            console.error('Fallback audio play also failed:', e);
        }
    });
    
    // Alternate for next time
    winnerSoundIndex = (winnerSoundIndex + 1) % 2;
}

function createConfetti() {
    const colors = ['#ffa726', '#fd9201', '#ff6f00', '#ffb74d', '#FFD700'];
    const confettiCount = 100;
    const container = document.body;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.position = 'fixed';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 1 + 2) + 's';
        confetti.style.zIndex = '9999';
        container.appendChild(confetti);
        
        setTimeout(() => {
            confetti.remove();
        }, 3500);
    }
}

function createSparkles() {
    const container = document.querySelector('.wheel-container');
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    
    for (let i = 0; i < 3; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = radius * (0.8 + Math.random() * 0.2);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        sparkle.style.left = (rect.left - container.getBoundingClientRect().left + rect.width / 2 + x) + 'px';
        sparkle.style.top = (rect.top - container.getBoundingClientRect().top + rect.height / 2 + y) + 'px';
        sparkle.style.setProperty('--tx', (Math.random() - 0.5) * 100 + 'px');
        sparkle.style.setProperty('--ty', (Math.random() - 0.5) * 100 + 'px');
        
        container.appendChild(sparkle);
        
        setTimeout(() => {
            sparkle.remove();
        }, 1500);
    }
}

function playClickSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playSpinningSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    let tickInterval;
    let tickDelay = 50;
    let isStopping = false;
    
    function playTick() {
        if (isStopping) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        
        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 1200;
        oscillator.type = 'square';
        
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        filter.Q.value = 5;
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.05);
        
        tickDelay = Math.min(tickDelay + 2, 300);
        
        if (!isStopping) {
            tickInterval = setTimeout(playTick, tickDelay);
        }
    }
    
    playTick();
    
    const whoosh = audioContext.createOscillator();
    const whooshGain = audioContext.createGain();
    const whooshFilter = audioContext.createBiquadFilter();
    
    whoosh.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(audioContext.destination);
    
    whoosh.type = 'sine';
    whoosh.frequency.value = 80;
    
    whooshFilter.type = 'lowpass';
    whooshFilter.frequency.value = 300;
    
    whooshGain.gain.setValueAtTime(0.03, audioContext.currentTime);
    
    whoosh.start(audioContext.currentTime);
    
    return {
        stop: function() {
            isStopping = true;
            clearTimeout(tickInterval);
            whooshGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            whoosh.stop(audioContext.currentTime + 0.5);
        }
    };
}

// Modal close functionality
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('winnerModal');
    const modalCloseBtn = document.querySelector('.modal-close-btn-small');
    
    function closeModal() {
        modal.classList.remove('show');
    }
    
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });
    
    // Load test names if available (for performance testing)
    const testNames = localStorage.getItem('testNames');
    if (testNames) {
        namesInput.value = testNames;
        updateNamesFromInput();
        console.log('Loaded test data:', names.length, 'names');
        // Clear it after loading
        localStorage.removeItem('testNames');
    }
    
    // Resize canvas based on CSS dimensions
    function resizeCanvas() {
        const canvasStyle = window.getComputedStyle(canvas);
        const width = parseInt(canvasStyle.width);
        const height = parseInt(canvasStyle.height);
        
        // Update canvas internal resolution
        canvas.width = width;
        canvas.height = height;
        
        // Invalidate cache on resize
        cacheValid = false;
        
        // Redraw wheel with new dimensions
        drawWheel();
    }
    
    // Initial resize
    resizeCanvas();
    
    // Handle window resize with debouncing for better performance
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeCanvas, 100);
    });
    
    // Disable spin button initially
    spinBtn.disabled = true;
});

// Listen for page visibility changes (tab switching)
// Note: Animation continues using real time (performance.now()) so it completes even when tab is hidden

// Clean up audio on page unload (closing tab/window or navigating away)
window.addEventListener('beforeunload', () => {
    if (activeSpinSound) {
        activeSpinSound.stop();
        activeSpinSound = null;
    }
    activeAudioElements.forEach(audio => {
        try {
            audio.pause();
        } catch (e) {}
    });
});

window.addEventListener('pagehide', () => {
    if (activeSpinSound) {
        activeSpinSound.stop();
        activeSpinSound = null;
    }
    activeAudioElements.forEach(audio => {
        try {
            audio.pause();
        } catch (e) {}
    });
});
