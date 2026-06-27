const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Visitor-painted canvas and travelling paint traces */
(() => {
  const canvas = document.querySelector('#ink-canvas');
  const pageCanvas = document.querySelector('#page-paint');
  const hero = document.querySelector('#hero');
  const toggle = document.querySelector('#paint-toggle');
  const clear = document.querySelector('#paint-clear');
  if (!canvas || !pageCanvas || !hero) return;

  const ctx = canvas.getContext('2d', { alpha: false });
  const pageCtx = pageCanvas.getContext('2d');
  const colors = ['#ff4b16', '#193cff', '#ff6eb4', '#10100f', '#efff35'];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pageWidth = 0;
  let pageHeight = 0;
  let painting = true;
  let pressed = false;
  let colorIndex = 0;
  let travel = 0;
  let queuedEvent = null;
  let pointerFrame = 0;
  let scrollTimer = 0;
  let lastScrollY = window.scrollY;
  let last = { x: 0, y: 0, pageX: 0, pageY: 0, time: 0, ready: false };

  const dot = (context, x, y, radius, color, alpha = 1) => {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  function splatter(context, x, y, color, scale = 1) {
    dot(context, x, y, (10 + Math.random() * 16) * scale, color, .9);
    const count = Math.min(18, Math.round(8 + 8 * scale));
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = (18 + Math.random() * 68) * scale;
      dot(context, x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, (1.5 + Math.random() * 5) * scale, color, .55 + Math.random() * .4);
    }
  }

  function stroke(context, fromX, fromY, toX, toY, speed, color, strength = 1) {
    const fast = Math.min(speed / 1.4, 1);
    const thickness = Math.max(5, (46 - fast * 31) * strength);
    context.save();
    context.globalAlpha = .3 + strength * .55;
    context.globalCompositeOperation = 'multiply';
    context.strokeStyle = color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = thickness;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.quadraticCurveTo((fromX + toX) / 2 + Math.sin(toY * .04) * 4, (fromY + toY) / 2, toX, toY);
    context.stroke();

    if (fast > .48) {
      context.globalAlpha *= .42;
      context.lineWidth = Math.max(1, thickness * .1);
      for (let i = -2; i <= 2; i += 1) {
        context.beginPath();
        context.moveTo(fromX, fromY + i * thickness * .22);
        context.lineTo(toX, toY + i * thickness * .22);
        context.stroke();
      }
    }
    context.restore();
  }

  function makeBaseComposition() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#efff35';
    ctx.fillRect(0, 0, width, height);
    const marks = width < 700 ? 7 : 12;
    for (let i = 0; i < marks; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const color = colors[i % 4];
      if (i % 3 === 0) splatter(ctx, x, y, color, .7 + Math.random() * 1.1);
      else stroke(ctx, x - 90, y - 30, x + 100 + Math.random() * 170, y + 30, .7, color, .7);
    }
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeBaseComposition();

    pageWidth = window.innerWidth;
    pageHeight = window.innerHeight;
    pageCanvas.width = Math.round(pageWidth * dpr);
    pageCanvas.height = Math.round(pageHeight * dpr);
    pageCanvas.style.width = `${pageWidth}px`;
    pageCanvas.style.height = `${pageHeight}px`;
    pageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduceMotion) {
      splatter(pageCtx, pageWidth * .88, pageHeight * .22, '#ff4b16', .8);
      splatter(pageCtx, pageWidth * .08, pageHeight * .74, '#193cff', .55);
    }
  }

  function paintPointer(event) {
    const now = performance.now();
    const heroRect = hero.getBoundingClientRect();
    const inHero = event.clientY >= heroRect.top && event.clientY <= heroRect.bottom;
    const dx = event.clientX - last.pageX;
    const dy = event.clientY - last.pageY;
    const distance = Math.hypot(dx, dy);
    const speed = distance / Math.max(12, now - last.time);

    if (last.ready && distance > 2) {
      travel += distance;
      if (travel > 115) {
        colorIndex = (colorIndex + 1) % colors.length;
        travel = 0;
      }
      const strength = pressed && painting ? 1.25 : .38;
      if (inHero) {
        stroke(ctx, last.x, last.y, event.clientX - heroRect.left, event.clientY - heroRect.top, speed, colors[colorIndex], strength);
      } else if (painting || distance > 9) {
        stroke(pageCtx, last.pageX, last.pageY, event.clientX, event.clientY, speed, colors[colorIndex], strength * .72);
      }
    }

    last = {
      x: event.clientX - heroRect.left,
      y: event.clientY - heroRect.top,
      pageX: event.clientX,
      pageY: event.clientY,
      time: now,
      ready: true
    };
    document.documentElement.style.setProperty('--brush-pressure', String(Math.max(.25, Math.min(1, 1.15 - speed))));
  }

  function onPointerMove(event) {
    if (reduceMotion || !painting || document.body.classList.contains('serious-open')) return;
    queuedEvent = event;
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      paintPointer(queuedEvent);
      pointerFrame = 0;
    });
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', (event) => {
    pressed = true;
    if (reduceMotion || !painting || document.body.classList.contains('serious-open') || event.target.closest('button, a, input, textarea')) return;
    const rect = hero.getBoundingClientRect();
    const context = event.clientY >= rect.top && event.clientY <= rect.bottom ? ctx : pageCtx;
    const x = context === ctx ? event.clientX - rect.left : event.clientX;
    const y = context === ctx ? event.clientY - rect.top : event.clientY;
    splatter(context, x, y, colors[colorIndex], 1.15);
  });
  window.addEventListener('pointerup', () => { pressed = false; });
  window.addEventListener('pointercancel', () => { pressed = false; });

  toggle?.addEventListener('click', () => {
    painting = !painting;
    toggle.setAttribute('aria-pressed', String(painting));
    toggle.textContent = painting ? 'Paint: on' : 'Paint: off';
    document.body.classList.toggle('paint-armed', painting);
    document.body.classList.toggle('paint-disabled', !painting);
    last.ready = false;
    lastScrollY = window.scrollY;
  });
  clear?.addEventListener('click', () => {
    pageCtx.clearRect(0, 0, pageWidth, pageHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#efff35';
    ctx.fillRect(0, 0, width, height);
    document.querySelectorAll('.paint-stamp').forEach((stamp) => stamp.remove());
    document.querySelectorAll('.form-row.is-stained').forEach((row) => {
      row.classList.remove('is-stained');
      row.style.removeProperty('--stain-x');
    });
    last.ready = false;
    document.dispatchEvent(new CustomEvent('offcut:goofy-message', { detail: 'Evidence destroyed. Very professional.' }));
  });

  document.addEventListener('offcut:splatter', (event) => {
    if (reduceMotion || !painting || document.body.classList.contains('serious-open')) return;
    const { x = pageWidth / 2, y = pageHeight / 2, scale = .75, color = colors[colorIndex] } = event.detail || {};
    splatter(pageCtx, x, y, color, scale);
  });

  window.addEventListener('scroll', () => {
    if (reduceMotion || !painting || document.body.classList.contains('serious-open')) return;
    const delta = window.scrollY - lastScrollY;
    document.documentElement.style.setProperty('--scroll-skew', `${Math.max(-2.2, Math.min(2.2, delta * .045))}deg`);
    if (Math.abs(delta) > 12 && Math.random() > .72) {
      const x = Math.random() > .5 ? Math.random() * 90 : pageWidth - Math.random() * 90;
      stroke(pageCtx, x, -20, x + (Math.random() - .5) * 25, 85 + Math.random() * 140, .35, colors[colorIndex], .42);
    }
    lastScrollY = window.scrollY;
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => document.documentElement.style.setProperty('--scroll-skew', '0deg'), 140);
  }, { passive: true });

  new ResizeObserver(resize).observe(hero);
})();

/* Clickable inside jokes: curiosity is the scheduler */
(() => {
  const status = document.querySelector('#status-copy');
  const statusButton = document.querySelector('#status-button');
  const heroLines = [...document.querySelectorAll('.hero-line')];
  const heroStamp = document.querySelector('.hero-stamp');
  const marquee = document.querySelector('.marquee');
  const projects = [...document.querySelectorAll('.project')];
  const inspector = document.querySelector('#quality-inspector');
  const message = document.querySelector('#goofy-message');
  if (!message) return;

  let messageTimer = 0;
  let arrowClicks = 0;
  let statusIndex = 0;
  let inspectorIndex = 0;

  function showMessage(copy) {
    window.clearTimeout(messageTimer);
    message.textContent = copy;
    message.classList.remove('is-visible');
    void message.offsetWidth;
    message.classList.add('is-visible');
    messageTimer = window.setTimeout(() => message.classList.remove('is-visible'), 3500);
  }

  document.addEventListener('offcut:goofy-message', (event) => showMessage(event.detail));

  const statuses = [
    'Taking on trouble',
    'Pretending this is strategy',
    'One plant has resigned',
    'Currently overthinking a div',
    'Making the logo bigger',
    'No beige detected',
    'Pixel union on lunch break'
  ];
  statusButton?.addEventListener('click', () => {
    statusIndex = (statusIndex + 1) % statuses.length;
    status.textContent = statuses[statusIndex];
    if (statusIndex === statuses.length - 1) showMessage('Please stop checking our operational status.');
  });

  const swaps = ['USELESS', 'IDEAS?', 'UNREASONABLE-ish', 'EXECUTING…'];
  heroLines.forEach((line, index) => {
    const original = line.innerHTML;
    line.addEventListener('click', () => {
      if (line.dataset.goofing) return;
      line.dataset.goofing = 'true';
      line.textContent = swaps[index];
      line.classList.add('goofy-glitch');
      window.setTimeout(() => {
        line.innerHTML = original;
        line.classList.remove('goofy-glitch');
        delete line.dataset.goofing;
      }, 1100);
    });
  });

  heroStamp?.addEventListener('click', () => {
    heroStamp.classList.remove('goofy-fall');
    void heroStamp.offsetWidth;
    heroStamp.classList.add('goofy-fall');
    showMessage('The one instruction was “do not.”');
    window.setTimeout(() => heroStamp.classList.remove('goofy-fall'), 1300);
  });

  document.querySelectorAll('.registration').forEach((mark, index) => {
    mark.addEventListener('click', () => {
      mark.classList.remove('registration-hit');
      void mark.offsetWidth;
      mark.classList.add('registration-hit');
      showMessage(index ? 'Registration mark registered your concern.' : 'Congratulations. You clicked the printer calibration.');
    });
  });

  function hurryMarquee() {
    if (marquee.classList.contains('goofy-rush')) return;
    marquee.classList.add('goofy-rush');
    showMessage('Marquee has somewhere to be.');
    window.setTimeout(() => marquee.classList.remove('goofy-rush'), 2800);
  }
  marquee?.addEventListener('click', hurryMarquee);
  marquee?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      hurryMarquee();
    }
  });

  const inspectionNotes = ['Checking vibes', 'Looks expensive', 'Hmm. A div.', 'Needs less restraint', 'Pass, somehow'];
  inspector?.addEventListener('click', () => {
    inspectorIndex = (inspectorIndex + 1) % inspectionNotes.length;
    inspector.style.left = `${5 + Math.random() * 82}vw`;
    inspector.style.top = `${16 + Math.random() * 68}vh`;
    inspector.querySelector('span').textContent = inspectionNotes[inspectorIndex];
    inspector.classList.remove('is-inspecting');
    void inspector.offsetWidth;
    inspector.classList.add('is-inspecting');
    window.setTimeout(() => inspector.classList.remove('is-inspecting'), 1500);
  });

  const tapeLabels = ['Client said make it pop', 'Legally a rectangle', 'Award pending', 'More concept per concept', 'Approved by someone', 'Do not lick the branding'];
  projects.forEach((project, index) => {
    project.querySelector('.project-open')?.addEventListener('click', () => {
      if (project.querySelector('.project-open').getAttribute('aria-expanded') === 'true') return;
      project.querySelector('.goofy-tape')?.remove();
      const tape = document.createElement('span');
      tape.className = 'goofy-tape';
      tape.setAttribute('aria-hidden', 'true');
      tape.textContent = tapeLabels[index];
      project.append(tape);
      window.setTimeout(() => tape.remove(), 5200);
    });
  });

  document.querySelectorAll('#work-prev, #work-next').forEach((button) => {
    button.addEventListener('click', () => {
      arrowClicks += 1;
      if (arrowClicks === 4) showMessage('Yes, the arrows work. Excellent research.');
      if (arrowClicks === 8) showMessage('There are still only six projects.');
      if (arrowClicks === 13) showMessage('This is now a carousel endurance event.');
    });
  });
})();

/* The one sincere part */
(() => {
  const trigger = document.querySelector('#why-trigger');
  const dialog = document.querySelector('#why-dialog');
  const close = document.querySelector('#why-close');
  if (!trigger || !dialog || !close) return;

  function openDialog() {
    document.body.classList.add('serious-open');
    dialog.showModal();
  }

  function closeDialog() {
    dialog.close();
  }

  trigger.addEventListener('click', openDialog);
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeDialog();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('serious-open');
    trigger.focus();
  });
})();

/* Header state and active navigation */
(() => {
  const header = document.querySelector('#site-header');
  const hero = document.querySelector('#hero');
  const sections = [...document.querySelectorAll('#work, #about, #contact')];
  const links = [...document.querySelectorAll('.nav-link')];
  if (!header || !hero) return;

  const setHeader = () => header.classList.toggle('scrolled', window.scrollY > hero.offsetHeight - 90);
  setHeader();
  window.addEventListener('scroll', setHeader, { passive: true });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: '-35% 0px -55%', threshold: 0 });
  sections.forEach((section) => observer.observe(section));
})();

/* Scroll reveals */
(() => {
  const items = document.querySelectorAll('.reveal');
  if (reduceMotion) {
    items.forEach((item) => item.classList.add('in-view'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  items.forEach((item) => observer.observe(item));
})();

/* Project rail, controls and disclosures */
(() => {
  const rail = document.querySelector('#project-rail');
  const projects = [...document.querySelectorAll('.project')];
  const previous = document.querySelector('#work-prev');
  const next = document.querySelector('#work-next');
  const count = document.querySelector('#work-count');
  if (!rail || !projects.length) return;

  let index = 0;
  let dragging = false;
  let startX = 0;
  let startScroll = 0;

  function updateCount() {
    const railCenter = rail.scrollLeft + rail.clientWidth / 2;
    let nearest = 0;
    let distance = Infinity;
    projects.forEach((project, projectIndex) => {
      const center = project.offsetLeft + project.offsetWidth / 2;
      if (Math.abs(center - railCenter) < distance) {
        nearest = projectIndex;
        distance = Math.abs(center - railCenter);
      }
    });
    index = nearest;
    if (count) count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
  }

  function goTo(target) {
    index = (target + projects.length) % projects.length;
    projects[index].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
  }

  previous?.addEventListener('click', () => goTo(index - 1));
  next?.addEventListener('click', () => goTo(index + 1));
  rail.addEventListener('scroll', updateCount, { passive: true });
  rail.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); }
  });

  rail.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || window.innerWidth <= 760) return;
    dragging = true;
    startX = event.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add('dragging');
    rail.setPointerCapture(event.pointerId);
  });
  rail.addEventListener('pointermove', (event) => {
    if (dragging) rail.scrollLeft = startScroll - (event.clientX - startX);
  });
  const stopDrag = () => { dragging = false; rail.classList.remove('dragging'); updateCount(); };
  rail.addEventListener('pointerup', stopDrag);
  rail.addEventListener('pointercancel', stopDrag);

  projects.forEach((project) => {
    const button = project.querySelector('.project-open');
    const detail = project.querySelector('.project-detail');
    button?.addEventListener('click', () => {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      projects.forEach((other) => {
        if (other === project) return;
        other.querySelector('.project-open')?.setAttribute('aria-expanded', 'false');
        const otherDetail = other.querySelector('.project-detail');
        if (otherDetail) otherDetail.hidden = true;
      });
      button.setAttribute('aria-expanded', String(opening));
      if (detail) detail.hidden = !opening;
      if (opening && !document.body.classList.contains('paint-disabled') && !document.body.classList.contains('serious-open')) {
        project.querySelector('.paint-stamp')?.remove();
        const stamp = document.createElement('span');
        stamp.className = 'paint-stamp';
        stamp.setAttribute('aria-hidden', 'true');
        stamp.innerHTML = `OPENED<br>WITHOUT<br>PERMISSION`;
        project.append(stamp);
        const rect = project.getBoundingClientRect();
        document.dispatchEvent(new CustomEvent('offcut:splatter', { detail: { x: Math.min(window.innerWidth - 40, rect.right - 25), y: Math.max(40, rect.top + rect.height * .45), scale: .65 } }));
      }
    });
  });
  updateCount();
})();

/* Type that behaves like it was printed before the ink dried */
(() => {
  if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
  const principles = document.querySelectorAll('.principles li');
  principles.forEach((item) => {
    const text = item.querySelector('p');
    if (!text) return;
    item.addEventListener('pointermove', (event) => {
      const rect = item.getBoundingClientRect();
      const unit = (event.clientX - rect.left) / rect.width - .5;
      text.style.setProperty('--principle-shift', `${unit * 14}px`);
      text.style.setProperty('--principle-skew', `${unit * -3.5}deg`);
      text.style.setProperty('--principle-split', `${Math.abs(unit) * 9}px`);
    });
    item.addEventListener('pointerleave', () => {
      text.style.removeProperty('--principle-shift');
      text.style.removeProperty('--principle-skew');
      text.style.removeProperty('--principle-split');
    });
  });
})();

/* Magnetic controls and custom stamp cursor */
(() => {
  if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
  const stamp = document.querySelector('.cursor-stamp');
  const magnetic = document.querySelectorAll('.magnetic');
  if (!stamp) return;

  window.addEventListener('pointermove', (event) => {
    stamp.style.left = `${event.clientX}px`;
    stamp.style.top = `${event.clientY}px`;
    stamp.classList.add('visible');
  }, { passive: true });
  window.addEventListener('pointerdown', () => stamp.classList.add('active'));
  window.addEventListener('pointerup', () => stamp.classList.remove('active'));
  document.documentElement.addEventListener('mouseleave', () => stamp.classList.remove('visible'));

  magnetic.forEach((element) => {
    element.addEventListener('pointermove', (event) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left - rect.width / 2) * 0.15;
      const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
      element.style.transform = `translate(${x}px, ${y}px)`;
    });
    element.addEventListener('pointerleave', () => { element.style.transform = ''; });
  });
})();

/* Contact-section punchline */
(() => {
  const form = document.querySelector('#contact-form');
  const email = document.querySelector('.contact-email');
  const toast = document.querySelector('#troll-toast');
  const close = toast?.querySelector('.troll-toast-close');
  if (!form || !email || !toast) return;

  let hideTimer;
  function showTroll() {
    window.clearTimeout(hideTimer);
    toast.hidden = false;
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    hideTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('is-visible');
    }, 6500);
  }

  email.addEventListener('click', (event) => {
    event.preventDefault();
    showTroll();
  });
  form.querySelectorAll('input, textarea').forEach((field) => {
    const stain = () => {
      if (document.body.classList.contains('paint-disabled') || document.body.classList.contains('serious-open')) return;
      const row = field.closest('.form-row');
      if (!row) return;
      row.classList.add('is-stained');
      row.style.setProperty('--stain-x', `${35 + Math.random() * 55}%`);
      const rect = field.getBoundingClientRect();
      document.dispatchEvent(new CustomEvent('offcut:splatter', { detail: { x: rect.right - 20, y: rect.top + rect.height / 2, scale: .42, color: Math.random() > .5 ? '#ff6eb4' : '#193cff' } }));
    };
    field.addEventListener('focus', stain, { once: true });
    field.addEventListener('input', () => {
      if (field.value.length === 1 || field.value.length % 18 === 0) stain();
    });
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    showTroll();
  });
  close?.addEventListener('click', () => {
    window.clearTimeout(hideTimer);
    toast.hidden = true;
    toast.classList.remove('is-visible');
  });
})();
