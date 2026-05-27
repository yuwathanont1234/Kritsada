/**
 * Luxury Authenticator — Interactive Photography Guide JavaScript Controller
 * Premium HTML5 Animated Tutorial Player and Slide Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. Translation Dictionary (TH/EN)
  // ==========================================================================
  let currentLang = 'en';

  const uiTranslations = {
    '#lang-btn': { en: 'TH', th: 'EN' },
    '.nav-links a[href="index.html#features"]': { en: 'Features', th: 'คุณสมบัติ' },
    '.nav-links a[href="index.html#simulator"]': { en: 'AI Simulator', th: 'ระบบจำลอง AI' },
    '.nav-links a[href="index.html#pricing"]': { en: 'Pricing', th: 'ราคาและแพ็กเกจ' },
    '.nav-links a[href="index.html#faq"]': { en: 'FAQ', th: 'คำถามที่พบบ่อย' },
    '.btn-primary-sm': { en: 'Launch App', th: 'เปิดใช้งานแอป' },
    '.guide-badge': { en: 'Photography Academy', th: 'สถาบันสอนการถ่ายภาพ' },
    '.guide-title': { en: 'Mastering Watch Photography for Neural Scanning', th: 'เทคนิคการถ่ายภาพนาฬิกาเพื่อความเที่ยงตรงของ AI' },
    '.guide-desc': { en: 'Follow this step-by-step interactive cinematic guide to calibrate your capture workflow for high-accuracy DINOv3 visual RAG verification.', th: 'เรียนรู้เทคนิคการถ่ายภาพทีละขั้นตอนผ่านเครื่องเล่นจำลอง เพื่อให้ภาพสแกนนาฬิกามีความแม่นยำสูงสุดในการตรวจสอบด้วยโมเดลวิเคราะห์ DINOv3' },
    '.voiceover-title': { en: 'Voiceover Narration (Script)', th: 'เสียงพากย์บรรยาย (สคริปต์)' },
    '#btn-prev': { en: 'Prev', th: 'ก่อนหน้า' },
    '#btn-next': { en: 'Next', th: 'ถัดไป' },
    '.neutrality-disclaimer': {
      en: '<strong>LEGAL DISCLAIMER:</strong> Luxury Authenticator is a fully independent visual analysis utility. We are not an authorized dealer, partner, or official representative of Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier, or any watch manufacturer. All brand names, logos, trademarks, and references shown on this page are properties of their respective owners, used solely for description and reference purposes. All evaluations are powered by optical AI models and are intended as preliminary secondary guidance.',
      th: '<strong>ข้อปฏิเสธความรับผิดชอบทางกฎหมาย:</strong> Luxury Authenticator เป็นเครื่องมืออำนวยความสะดวกในการตรวจวิเคราะห์ลักษณะทางสายตาที่เป็นอิสระอย่างสิ้นเชิง เราไม่ใช่ตัวแทนจำหน่ายอย่างเป็นทางการ พันธมิตร หรือผู้แทนของ Rolex, Patek Philippe, Audemars Piguet, Omega, Cartier หรือผู้ผลิตรายใด ชื่อสินค้า โลโก้ และเครื่องหมายการค้าทั้งหมดที่ปรากฏบนเว็บไซต์นี้เป็นสิทธิ์ของเจ้าของแบรนด์เหล่านั้น ใช้เพียงเพื่อเป็นข้อมูลอธิบายอ้างอิงเท่านั้น ผลลัพธ์จากการสแกน AI เป็นเพียงข้อมูลนำเสนอในระดับประเมินความสอดคล้องทางกายภาพเบื้องต้น ไม่เทียบเท่าใบรับรองมาตรฐานเป็นทางการ'
    },
    '.copyright': {
      en: '&copy; 2026 Luxury Authenticator. All rights reserved.',
      th: '&copy; 2026 Luxury Authenticator. สงวนลิขสิทธิ์ทั้งหมด.'
    }
  };

  const chapterData = [
    {
      num: 'Chapter 01',
      title: { en: 'The Goal of Visual Scanning', th: 'เป้าหมายของการสแกนภาพ' },
      body: { 
        en: 'Our AI verification model (DINOv3) runs purely on optical truth. To detect micrometric anomalies, dial spacing variations, and bevel angles, your photos must serve as a high-fidelity visual blueprint. The goal is flat, reflection-free, crystal-clear captures.', 
        th: 'โมเดลตรวจสอบ AI (DINOv3) ของเรา วิเคราะห์ผลจากหลักฐานทางสายตาร้อยเปอร์เซ็นต์ ในการตรวจจับความผิดเพี้ยนระดับไมโครเมตร ระยะหน้าปัด และองศาลบมุมโลหะ ภาพถ่ายของคุณจะต้องเป็นเสมือนพิมพ์เขียวที่ไร้เงาสะท้อนและมีความคมชัดสมบูรณ์แบบ' 
      },
      tips: {
        en: ['Capture high-density steel finishes', 'Ensure all indices are visible', 'Zero placeholder or blur elements'],
        th: ['จับรายละเอียดพื้นผิวสตีลความละเอียดสูง', 'ตรวจสอบให้มั่นใจว่าเข็มและขีดหลักเวลาแสดงชัดเจน', 'ภาพต้องห้ามมีความสั่นไหวหรือเบลอ']
      },
      voiceover: {
        en: 'Welcome to the Luxury Authenticator Photography Academy. Our AI verification model runs on optical truth. To catch fine details and anomalies, your photos must be taken with absolute precision. Let\'s look at the correct techniques.',
        th: 'ยินดีต้อนรับสู่สถาบันสอนการถ่ายภาพเพื่อการสแกน Luxury Authenticator โมเดล AI ของเราทำงานอ้างอิงจากหลักฐานทางสายตา เพื่อให้สามารถตรวจจับรายละเอียดระดับย่อยและข้อบกพร่องได้อย่างแม่นยำ ภาพถ่ายของคุณจะต้องทำอย่างประณีต มาดูขั้นตอนที่ถูกต้องกันครับ'
      }
    },
    {
      num: 'Chapter 02',
      title: { en: 'Wipe & Clean Prep', th: 'การเช็ดและทำความสะอาด' },
      body: { 
        en: 'Before capturing any shots, always wipe the watch face and case thoroughly. Tiny dust motes, invisible body oils, and smudged fingerprints can be misread by the neural networks as printing flaws or bezel scratches, causing incorrect anomalies to be flagged.', 
        th: 'ก่อนถ่ายภาพทุกครั้ง ให้ใช้ผ้าไมโครไฟเบอร์สะอาดเช็ดหน้าปัดและขอบตัวเรือนให้ทั่ว คราบไขมัน ฝุ่นเม็ดเล็ก หรือรอยนิ้วมือที่มองไม่เห็นด้วยตาเปล่า อาจถูกระบบโครงข่ายประสาทเทียมอ่านค่าผิดเพี้ยนเป็นตำหนิการพิมพ์ หรือรอยขูดขีดบนเบเซลได้' 
      },
      tips: {
        en: ['Use a clean, lint-free microfiber cloth', 'Remove dust on crystals and links', 'Place on a dark, non-reflective matte background'],
        th: ['ใช้ผ้าไมโครไฟเบอร์ที่ปราศจากขนขุย', 'ปัดฝุ่นตามขอบกระจกและข้อต่อสายออกให้หมด', 'จัดวางนาฬิกาบนพื้นหลังโทนเข้มผิวด้านไม่สะท้อนแสง']
      },
      voiceover: {
        en: 'Before capturing any shots, always wipe the watch face and case with a clean microfiber cloth. Invisible grease, dust particles, and fingerprints can be misread by neural networks as dial printing defects or flaws. A clean watch is the foundation of high-accuracy scanning.',
        th: 'ก่อนถ่ายภาพทุกครั้ง ให้เช็ดทำความสะอาดหน้าปัดและตัวเรือนด้วยผ้าไมโครไฟเบอร์สะอาด คราบไขมัน ฝุ่นเม็ดเล็ก หรือรอยนิ้วมือที่มองไม่เห็นด้วยตาเปล่า อาจถูก AI ตีความผิดเพี้ยนว่าเป็นรอยตำหนิหรือฟอนต์พิมพ์เบี้ยว การทำความสะอาดคือพื้นฐานสำคัญที่สุด'
      }
    },
    {
      num: 'Chapter 03',
      title: { en: 'Soft, Diffused Lighting', th: 'การจัดแสงที่นุ่มนวลกระจายตัว' },
      body: { 
        en: 'Never use direct smartphone camera flash. Direct flash creates harsh white hotspots (glare) that blow out details, wash out contrast, and hide actual markings. Instead, shoot under indirect, diffused side lighting, such as next to a window or under a lightbox. Use the slider on the left to see the difference.', 
        th: 'ห้ามใช้แสงแฟลชของกล้องโทรศัพท์ส่องตรงเด็ดขาด แสงแฟลชที่รุนแรงจะทำให้เกิดจุดสะท้อนแสงขาวจ้า (glare) บดบังรายละเอียดของหน้าปัดและขอบโลหะ ควรใช้แสงธรรมชาติที่ผ่านกรองนุ่มนวล หรือแสงผ่านผ้ากรองจากด้านข้างแทน ลองเลื่อนแถบเปรียบเทียบ Before/After ทางซ้ายเพื่อดูความแตกต่าง' 
      },
      tips: {
        en: ['Avoid direct camera flash completely', 'Use window light or diffuse light sources', 'Capture steel reflections smoothly'],
        th: ['หลีกเลี่ยงการเปิดแฟลชกล้องถ่ายตรงโดยเด็ดขาด', 'ใช้แสงสว่างสม่ำเสมอจากข้างหน้าต่างหรือจัดไฟผ่านผ้ากรอง', 'บันทึกแสงเงาสะท้อนสตีลให้ไล่ระดับอย่างนุ่มนวล']
      },
      voiceover: {
        en: 'Never use direct smartphone flash. Harsh flash creates white glare hotspots that wash out metal textures and hide fine dial markings. Instead, position your watch under soft, diffused side lighting (like near a window or using a softbox). Drag the slider below to see the difference.',
        th: 'ห้ามใช้แสงแฟลชของมือถือยิงตรงหน้าปัด แสงแฟลชที่แรงเกินไปจะสร้างจุดสะท้อนสีขาว (glare) บดบังลวดลายโลหะและฟอนต์สำคัญ ให้จัดวางนาฬิกาใต้แสงที่นุ่มนวลและกระจายตัวจากด้านข้าง (เช่น ข้างหน้าต่าง หรือใช้กล่องซอฟต์บ็อกซ์) ลองเลื่อนแถบเพื่อดูข้อแตกต่างครับ'
      }
    },
    {
      num: 'Chapter 04',
      title: { en: 'Camera Angle & Focus', th: 'มุมกล้องขนานและการโฟกัสจับภาพ' },
      body: { 
        en: 'Hold your phone perfectly parallel (90 degrees) to the watch face. Smartphone wide-angle lenses create "barrel distortion" when held too close, causing the dial to warp. To prevent this, stand back slightly and zoom in to 2x. Tap the screen to focus manually, ensuring every single dial marker is razor-sharp.', 
        th: 'ถือกล้องโทรศัพท์ขนานแนวระนาบ 90 องศากับหน้าปัด เลนส์มุมกว้างธรรมดาจะทำให้เกิดภาพบิดเบี้ยวปูดบวม (barrel distortion) เมื่อถ่ายใกล้เกินไป วิธีแก้ไขคือ ให้ขยับมือถือออกห่างเล็กน้อยแล้วใช้ระบบซูม 2 เท่าแทน และแตะหน้าจอเพื่อล็อคโฟกัสให้อ่านตัวอักษรได้คมชัดสูงสุด' 
      },
      tips: {
        en: ['Stand back and use 2x zoom option', '90-degree parallel orthogonal angle', 'Tap screen to lock focus explicitly'],
        th: ['ถอยหลังและตั้งกล้องซูม 2 เท่าเพื่อป้องกันเลนส์บวม', 'วางระดับกล้องขนานระนาบ 90 องศาตรงๆ', 'แตะเลือกจุดโฟกัสกลางหน้าปัดเพื่อล็อกความคมชัด']
      },
      voiceover: {
        en: 'Hold the camera perfectly parallel at a 90-degree angle to the watch face. Standard wide-angle lenses on phones create barrel distortion, making the watch look curved. To prevent this, stand back slightly and use 2x zoom. Ensure the entire dial surface is sharp and in crisp focus.',
        th: 'ถือกล้องให้ขนานกับหน้าปัดนาฬิกาเป็นมุม 90 องศา เลนส์มุมกว้างปกติของมือถือจะสร้างความปูดบวมที่ขอบภาพ (barrel distortion) เพื่อป้องกันปัญหานี้ ให้ถอยหลังออกมาเล็กน้อยแล้วใช้การซูม 2 เท่าแทน และตรวจสอบให้มั่นใจว่าพื้นผิวหน้าปัดทั้งหมดมีความคมชัดในโฟกัส'
      }
    },
    {
      num: 'Chapter 05',
      title: { en: 'The 3 Critical Scanning Shots', th: 'ภาพถ่าย 3 มุมสำคัญในการสแกน' },
      body: { 
        en: 'For standard and professional verification tiers, the app processes a multi-angle ensemble: 1. Front view to check dial text alignment, 2. Caseback view to inspect the movement mechanical layout or engravings, and 3. Side profile to examine bezel thickness, steel brushing, and crown guard finishings.', 
        th: 'แอปพลิเคชันต้องการภาพถ่าย 3 มุมสำคัญเพื่อให้โมเดล AI ประมวลผลได้อย่างสมบูรณ์: 1. มุมหน้าปัดตรง เพื่อตรวจสัดส่วนฟอนต์อักษรและการจัดวาง 2. มุมฝาหลัง เพื่อเช็คชิ้นงานสลักเครื่องหรือลายฟันเฟืองจักร และ 3. มุมด้านข้าง เพื่อตรวจสอบความหนา ลายขัดซาติน และรูปทรงของบ่าเม็ดมะยม' 
      },
      tips: {
        en: ['Front Face Dial (1/3)', 'Caseback / Movement (2/3)', 'Side Crown Profile (3/3)'],
        th: ['มุมหน้าตรงหน้าปัด บอกรายละเอียดหลัก (1/3)', 'มุมฝาหลังหรือจักรกลภายในกลไก (2/3)', 'มุมขอบข้างฝั่งเม็ดมะยม แสดงสเปกความหนา (3/3)']
      },
      voiceover: {
        en: 'Capture the three essential shots required for a successful scan: 1. Front dial view for alignment and typography, 2. Caseback view to analyze movement mechanics and engravings, and 3. Side profile to verify case thickness and crown proportions. This provides a complete optical blueprint.',
        th: 'ถ่ายภาพให้ครบ 3 มุมหลักที่แอปพลิเคชันต้องการ ได้แก่ 1. มุมหน้าปัดตรง เพื่อตรวจเช็คความสมมาตรและตัวอักษร 2. มุมฝาหลัง เพื่อวิเคราะห์ฟันเฟืองและรอยสลัก และ 3. มุมด้านข้างตัวเรือน เพื่อเช็คความหนาและสัดส่วนมะยม นี่คือพิมพ์เขียวภาพสมบูรณ์แบบสำหรับ AI'
      }
    }
  ];

  // ==========================================================================
  // 2. Playback State Management & Elements
  // ==========================================================================
  let activeChapterIndex = 0;
  let isPlaying = false;
  let playbackTimer = null;
  let progressPercent = 0;
  
  const totalChapters = chapterData.length;
  const chapterDurationMs = 12000; // 12 seconds per slide in autoplay mode
  const timerTickMs = 100; // Tick every 100ms for smooth progress bar

  // Select DOM Elements
  const slides = document.querySelectorAll('.chapter-slide');
  const stepMarkers = document.querySelectorAll('.step-marker');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const timelineProgressFilled = document.querySelector('.timeline-progress-filled');
  const playbackTimeSpan = document.querySelector('.playback-time');
  const voiceoverTextLine = document.querySelector('.voiceover-text-line');
  const langBtn = document.getElementById('lang-btn');

  // ==========================================================================
  // 3. Core Player Controls Functions
  // ==========================================================================
  
  function updateUI() {
    // 1. Manage Active classes on slides and markers
    slides.forEach((slide, idx) => {
      if (idx === activeChapterIndex) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });

    stepMarkers.forEach((marker, idx) => {
      if (idx === activeChapterIndex) {
        marker.classList.add('active');
      } else {
        marker.classList.remove('active');
      }
    });

    // 2. Update descriptive texts dynamically based on current language
    const currentData = chapterData[activeChapterIndex];
    const slideDom = slides[activeChapterIndex];

    if (slideDom) {
      const numSpan = slideDom.querySelector('.chapter-number');
      const headingH2 = slideDom.querySelector('.chapter-heading');
      const bodyP = slideDom.querySelector('.chapter-body-text');
      const tipsContainer = slideDom.querySelector('.tips-list');

      if (numSpan) numSpan.textContent = currentData.num;
      if (headingH2) headingH2.textContent = currentData.title[currentLang];
      if (bodyP) bodyP.textContent = currentData.body[currentLang];

      // Re-populate tips bullets
      if (tipsContainer) {
        tipsContainer.innerHTML = '';
        currentData.tips[currentLang].forEach(tipText => {
          const li = document.createElement('div');
          li.className = 'tip-item';
          li.innerHTML = `<span class="tip-bullet">✓</span><span>${tipText}</span>`;
          tipsContainer.appendChild(li);
        });
      }
    }

    // 3. Update Voiceover Teleprompter
    if (voiceoverTextLine) {
      voiceoverTextLine.textContent = `"${currentData.voiceover[currentLang]}"`;
    }

    // 4. Update timeline indicators
    const currentMin = Math.floor((activeChapterIndex * (chapterDurationMs / 1000)) / 60);
    const currentSec = Math.floor((activeChapterIndex * (chapterDurationMs / 1000)) % 60);
    playbackTimeSpan.textContent = `${currentMin}:${currentSec.toString().padStart(2, '0')}`;

    // Reset before/after slider (Chapter 3) to 50% on mount/change
    if (activeChapterIndex === 2) {
      resetSliderWidget();
    }
  }

  function play() {
    isPlaying = true;
    btnPlayPause.innerHTML = '⏸'; // Set pause icon
    
    playbackTimer = setInterval(() => {
      progressPercent += (timerTickMs / chapterDurationMs) * 100;
      
      if (progressPercent >= 100) {
        progressPercent = 0;
        if (activeChapterIndex < totalChapters - 1) {
          activeChapterIndex++;
          updateUI();
        } else {
          // Loop back to start or pause
          pause();
          activeChapterIndex = 0;
          updateUI();
        }
      }
      
      // Update Scrubber UI
      timelineProgressFilled.style.width = `${progressPercent}%`;
    }, timerTickMs);
  }

  function pause() {
    isPlaying = false;
    btnPlayPause.innerHTML = '▶'; // Set play icon
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  function resetProgress() {
    progressPercent = 0;
    timelineProgressFilled.style.width = '0%';
  }

  // ==========================================================================
  // 4. Event Handlers
  // ==========================================================================

  btnPlayPause.addEventListener('click', () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  });

  btnPrev.addEventListener('click', () => {
    pause();
    resetProgress();
    if (activeChapterIndex > 0) {
      activeChapterIndex--;
    } else {
      activeChapterIndex = totalChapters - 1; // loop back
    }
    updateUI();
  });

  btnNext.addEventListener('click', () => {
    pause();
    resetProgress();
    if (activeChapterIndex < totalChapters - 1) {
      activeChapterIndex++;
    } else {
      activeChapterIndex = 0; // loop back
    }
    updateUI();
  });

  stepMarkers.forEach((marker) => {
    marker.addEventListener('click', () => {
      const idx = parseInt(marker.getAttribute('data-step'));
      pause();
      resetProgress();
      activeChapterIndex = idx;
      updateUI();
    });
  });

  // Handle timeline scrubber clicking
  const timelineBar = document.querySelector('.progress-timeline-bar');
  if (timelineBar) {
    timelineBar.addEventListener('click', (e) => {
      const barRect = timelineBar.getBoundingClientRect();
      const clickX = e.clientX - barRect.left;
      const clickedPercent = (clickX / barRect.width) * 100;
      
      pause();
      
      // Map clicked percentage to corresponding chapter index
      const targetChap = Math.min(Math.floor((clickedPercent / 100) * totalChapters), totalChapters - 1);
      activeChapterIndex = targetChap;
      
      // Calculate remaining progress inside that chapter
      const chapterRangePercent = 100 / totalChapters;
      const progressInChapterPercent = ((clickedPercent % chapterRangePercent) / chapterRangePercent) * 100;
      
      progressPercent = progressInChapterPercent;
      timelineProgressFilled.style.width = `${progressPercent}%`;
      
      updateUI();
    });
  }

  // ==========================================================================
  // 5. Before/After Interactive Slider (Chapter 3 Spec)
  // ==========================================================================
  const sliderContainer = document.querySelector('.comparison-slider-container');
  const imgAfter = document.querySelector('.slider-img.img-after');
  const sliderHandle = document.querySelector('.slider-handle-bar');
  let isDraggingSlider = false;

  function resetSliderWidget() {
    if (imgAfter && sliderHandle) {
      imgAfter.style.clipPath = 'polygon(0 0, 50% 0, 50% 100%, 0 100%)';
      sliderHandle.style.left = '50%';
    }
  }

  if (sliderContainer) {
    function moveSlider(xPos) {
      const containerRect = sliderContainer.getBoundingClientRect();
      let clickX = xPos - containerRect.left;
      
      // Constrain position to container boundaries
      if (clickX < 0) clickX = 0;
      if (clickX > containerRect.width) clickX = containerRect.width;
      
      const percent = (clickX / containerRect.width) * 100;
      imgAfter.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`;
      sliderHandle.style.left = `${percent}%`;
    }

    // Desktop Mouse Events
    sliderHandle.addEventListener('mousedown', () => {
      isDraggingSlider = true;
      pause(); // Pause video player playback on manual drag
    });

    window.addEventListener('mouseup', () => {
      isDraggingSlider = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingSlider) return;
      moveSlider(e.clientX);
    });

    // Mobile Touch Events
    sliderHandle.addEventListener('touchstart', () => {
      isDraggingSlider = true;
      pause();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDraggingSlider = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (!isDraggingSlider) return;
      if (e.touches[0]) {
        moveSlider(e.touches[0].clientX);
      }
    }, { passive: true });
  }

  // ==========================================================================
  // 6. Dynamic Language Toggle Coordination
  // ==========================================================================
  function setLanguage(lang) {
    currentLang = lang;
    
    // Toggle language button text
    if (lang === 'en') {
      langBtn.textContent = 'TH';
    } else {
      langBtn.textContent = 'EN';
    }

    // Apply translations on static elements
    Object.keys(uiTranslations).forEach((selector) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        if (element) {
          const trans = uiTranslations[selector][lang];
          element.innerHTML = trans;
        }
      });
    });

    // Update active slide content text
    updateUI();
  }

  langBtn.addEventListener('click', () => {
    const nextLang = currentLang === 'en' ? 'th' : 'en';
    setLanguage(nextLang);
  });

  // ==========================================================================
  // 7. Initialization
  // ==========================================================================
  setLanguage('th'); // Set Thai as default language to match user request
});
