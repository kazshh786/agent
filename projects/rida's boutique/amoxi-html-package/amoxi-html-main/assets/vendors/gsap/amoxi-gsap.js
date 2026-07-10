(function ($) {
  "use strict";

  $(window).on("load", function () {
    inibwarquees();
    inibwarquee();
    inibwarqueeLeft();
    circleShapeAnim();
    anim_reveal_button();
    bw_reveal_text();
    bw_reveal_text2();
    bwTitleAnimation();
  });

  gsap.registerPlugin(
    ScrollTrigger,
    ScrollSmoother,
    ScrollToPlugin,
    CustomEase
  );

  // smooth scroll
  if ($("#smooth-wrapper").length && $("#smooth-content").length) {
    ScrollSmoother.create({
      smooth: 2,
      effects: true,
      smoothTouch: 0.1,
      ignoreMobileResize: false
    });
    ScrollTrigger.refresh(true);
  }

  // text invert with scroll
  const split = new SplitText(".bw-split-text", {
    type: "lines"
  });
  split.lines.forEach((target) => {
    gsap.to(target, {
      backgroundPositionX: 0,
      ease: "none",
      scrollTrigger: {
        trigger: target,
        scrub: 1,
        start: "top 90%",
        end: "bottom center"
      }
    });
  });

  // reveal text animation 01
  function bw_reveal_text() {
    const bwElements = document.querySelectorAll(".bw-reveal-text");

    bwElements.forEach((el) => {
      if (!el.dataset.original) {
        el.dataset.original = el.innerHTML;
      }
    });

    const splitWords = (el) => {
      const text = el.dataset.original;
      const wrapper = document.createElement("div");
      wrapper.innerHTML = text;

      const nodes = Array.from(wrapper.childNodes);
      const wrappedHTML = nodes
        .map((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent
              .split(/\s/)
              .map((word) => {
                return word
                  .split("-")
                  .map((part) => `<span class="word">${part}</span>`)
                  .join('<span class="hyphen">-</span>');
              })
              .join('<span class="whitespace"> </span>');
          } else {
            return node.outerHTML;
          }
        })
        .join("");
      el.innerHTML = wrappedHTML;
    };

    const getLines = (el) => {
      const lines = [];
      let line = [];
      const words = el.querySelectorAll("span");
      let lastTop = null;

      words.forEach((word) => {
        if (
          word.offsetTop !== lastTop &&
          !word.classList.contains("whitespace")
        ) {
          lastTop = word.offsetTop;
          line = [];
          lines.push(line);
        }
        line.push(word);
      });

      return lines;
    };

    const splitLines = (el) => {
      splitWords(el);

      const lines = getLines(el);
      let wrappedHTML = "";

      lines.forEach((wordsArr) => {
        wrappedHTML += '<span class="line"><span class="words">';
        wordsArr.forEach((word) => {
          wrappedHTML += word.outerHTML;
        });
        wrappedHTML += "</span></span>";
      });

      el.innerHTML = wrappedHTML;
    };

    const initReveal = (el) => {
      const lines = el.querySelectorAll(".words");
      gsap.killTweensOf(lines);
      gsap.set(el, { autoAlpha: 1 });

      gsap.from(lines, {
        yPercent: 100,
        ease: "power3.out",
        stagger: 0.25,
        duration: 1,
        delay: 0.2,
        scrollTrigger: {
          trigger: el,
          toggleActions: "restart none none reset"
        }
      });
    };

    const runAll = () => {
      bwElements.forEach((el) => {
        splitLines(el);
        initReveal(el);
      });
    };

    runAll();

    // Debounce resize: 200ms delay
    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        runAll();
      }, 200);
    });
  }

  // reveal text animation 02
  function bw_reveal_text2() {
    const textRevealElements = document.querySelectorAll(".bw-reveal-text-2");

    textRevealElements.forEach((element) => {
      const nodes = Array.from(element.childNodes);
      element.innerHTML = "";

      nodes.forEach((node) => {
        if (node.nodeName === "BR") {
          element.appendChild(node.cloneNode());
          return;
        }

        if (node.nodeType === 3) {
          node.textContent.split(/(\s+)/).forEach((text) => {
            if (!text.trim()) {
              element.append(text);
            } else {
              const word = document.createElement("div");
              word.className = "word";
              word.textContent = text;
              element.appendChild(word);
            }
          });
          return;
        }

        if (node.nodeType === 1) {
          const word = document.createElement("div");
          word.className = "word";
          word.appendChild(node.cloneNode(true));
          element.appendChild(word);
        }
      });

      element.querySelectorAll(".word").forEach((word) => {
        if (word.children.length) {
          word.querySelectorAll("*").forEach((tag) => {
            const childNodes = Array.from(tag.childNodes);
            tag.innerHTML = "";

            childNodes.forEach((node) => {
              if (node.nodeType === 1) {
                tag.appendChild(node);
                return;
              }

              if (node.nodeType === 3) {
                node.textContent.split("").forEach((char) => {
                  if (!char.trim()) {
                    tag.append(char);
                  } else {
                    const p = document.createElement("div");
                    p.className = "perspective";
                    p.innerHTML = `<div class="letter"><div>${char}</div></div>`;
                    tag.appendChild(p);
                  }
                });
              }
            });
          });
        }

        if (!word.children.length) {
          const text = word.textContent;
          word.innerHTML = "";
          text.split("").forEach((char) => {
            if (!char.trim()) {
              word.append(char);
            } else {
              const p = document.createElement("div");
              p.className = "perspective";
              p.innerHTML = `<div class="letter"><div>${char}</div></div>`;
              word.appendChild(p);
            }
          });
        }
      });

      const letters = element.querySelectorAll(".letter");

      let tl = gsap.timeline({
        scrollTrigger: {
          trigger: element,
          toggleActions: "restart none none reset"
        }
      });

      tl.set(element, { autoAlpha: 1 });
      tl.fromTo(
        letters,
        1.6,
        {
          transformOrigin: "center",
          rotationY: 90,
          x: 30
        },
        {
          rotationY: 0.1,
          x: 0,
          stagger: 0.025,
          ease: CustomEase.create("custom", "M0,0 C0.425,0.005 0,1 1,1 ")
        }
      );
    });
  }

  // bw title animation
  function bwTitleAnimation() {
    if (!document.querySelector(".bw-title-anim")) return;

    let splitTitleLines = gsap.utils.toArray(".bw-title-anim");

    splitTitleLines.forEach((splitTextLine) => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: splitTextLine,
          start: "top 90%",
          end: "bottom 60%",
          scrub: false,
          markers: false,
          toggleActions: "play none none reverse"
        }
      });

      const itemSplitted = new SplitText(splitTextLine, {
        type: "words, lines"
      });

      gsap.set(splitTextLine, { perspective: 400 });

      itemSplitted.split({ type: "lines" });

      tl.from(itemSplitted.lines, {
        duration: 1,
        delay: 0.3,
        opacity: 0,
        rotationX: -80,
        force3D: true,
        transformOrigin: "top center -50",
        stagger: 0.1
      });
    });
  }

  // scroll content horizontal & vertically
  document.querySelectorAll(".bw-scroll").forEach((section) => {
    let tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 100%",
        end: "bottom top",
        scrub: 1,
        markers: false
      }
    });

    const rl = section.querySelector(".bw-scroll-rl");
    const lr = section.querySelector(".bw-scroll-lr");
    const top = section.querySelector(".bw-scroll-top");
    const bottom = section.querySelector(".bw-scroll-bottom");

    if (rl) tl.from(rl, { xPercent: 20 }, 0);
    if (lr) tl.from(lr, { xPercent: -20 }, 0);
    if (top) tl.from(top, { yPercent: 10 }, 0);
    if (bottom) tl.from(bottom, { yPercent: -10 }, 0);
  });

  // button hover animation
  $(".amoxi-circle-btn").on("mouseenter", function (e) {
    var x = e.pageX - $(this).offset().left;
    var y = e.pageY - $(this).offset().top;

    $(this).find(".amoxi-circle-btn__dot").css({
      top: y,
      left: x
    });
  });

  $(".amoxi-circle-btn").on("mouseout", function (e) {
    var x = e.pageX - $(this).offset().left;
    var y = e.pageY - $(this).offset().top;

    $(this).find(".amoxi-circle-btn__dot").css({
      top: y,
      left: x
    });
  });
  var hoverBtns = gsap.utils.toArray(".amoxi-circle-btn-wrapper");
  const hoverBtnItem = gsap.utils.toArray(".amoxi-circle-btn");
  hoverBtns.forEach((btn, i) => {
    $(btn).mousemove(function (e) {
      callParallax(e);
    });

    function callParallax(e) {
      parallaxIt(e, hoverBtnItem[i], 80);
    }

    function parallaxIt(e, target, movement) {
      var $this = $(btn);
      var relX = e.pageX - $this.offset().left;
      var relY = e.pageY - $this.offset().top;

      gsap.to(target, 0.5, {
        x: ((relX - $this.width() / 2) / $this.width()) * movement,
        y: ((relY - $this.height() / 2) / $this.height()) * movement,
        ease: Power2.easeOut
      });
    }
    $(btn).mouseleave(function (e) {
      gsap.to(hoverBtnItem[i], 0.5, {
        x: 0,
        y: 0,
        ease: Power2.easeOut
      });
    });
  });

  // anim reveal button
  function anim_reveal_button() {
    gsap.utils.toArray(".anim-reveal-btn").forEach((cta) => {
      gsap.fromTo(
        cta,
        {
          opacity: 0,
          y: 80,
          scaleX: 0.85
        },
        {
          opacity: 1,
          y: 0,
          scaleX: 1,
          duration: 1.2,
          ease: "power4.out",
          scrollTrigger: {
            trigger: cta,
            start: "top 85%",
            once: true
          }
        }
      );

      gsap.to(cta, {
        scale: 1.04,
        duration: 2.5,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        delay: 1.2
      });

      const arrow = cta.querySelector(".anim-reveal-btn__arrow");
      if (arrow) {
        gsap.to(arrow, {
          x: 12,
          duration: 0.8,
          ease: "power2.inOut",
          repeat: -1,
          yoyo: true
        });
      }

      cta.addEventListener("mousemove", (e) => {
        const rect = cta.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        gsap.to(cta, {
          x: x * 0.15,
          y: y * 0.15,
          duration: 0.3,
          ease: "power3.out"
        });
      });

      cta.addEventListener("mouseleave", () => {
        gsap.to(cta, {
          x: 0,
          y: 0,
          duration: 0.5,
          ease: "power3.out"
        });
      });
    });
  }

  // direction based hover zoom image
  document.querySelectorAll(".bw-hover-item").forEach((card) => {
    const img = card.querySelector(".bw-hover-img img");

    card.addEventListener("mouseenter", (e) => {
      const bounds = card.getBoundingClientRect();
      const x = (e.clientX - bounds.left - bounds.width / 2) / 10;
      const y = (e.clientY - bounds.top - bounds.height / 2) / 10;

      gsap.to(img, {
        scale: 1.15,
        x: x,
        y: y,
        duration: 0.6,
        ease: "power3.out"
      });
    });

    card.addEventListener("mouseleave", () => {
      gsap.to(img, {
        scale: 1,
        x: 0,
        y: 0,
        duration: 0.6
      });
    });
  });

  // services panel pin scrolling
  let sv = gsap.matchMedia();
  sv.add("(min-width: 1199px)", () => {
    let tl = gsap.timeline();
    let projecbwanels = document.querySelectorAll(".bw-service-panel");
    let baseOffset = 130;
    let offsetIncrement = 130;

    projecbwanels.forEach((section, index) => {
      let topOffset = baseOffset + index * offsetIncrement;
      let title = section.querySelector(".bw-service-category");
      tl.to(section, {
        scrollTrigger: {
          trigger: section,
          pin: section,
          scrub: 1,
          start: `top ${topOffset}px`,
          end: "bottom 120%",
          endTrigger: ".bw-service-pin",
          pinSpacing: false,
          markers: false,
          onEnter: () => {
            gsap.to(title, {
              opacity: 1,
              y: 0,
              duration: 0.4,
              ease: "power2.out"
            });
          },
          onLeaveBack: () => {
            gsap.to(title, {
              opacity: 0,
              y: 20,
              duration: 0.3,
              ease: "power2.in"
            });
          }
        }
      });
    });
  });

  // portfolio panel pin scrolling
  let pr = gsap.matchMedia();
  pr.add("(min-width: 767px)", () => {
    let tl = gsap.timeline();
    let otherSections = document.querySelectorAll(".bw-portfolio-panel");
    otherSections.forEach((section, index) => {
      gsap.set(otherSections, {
        scale: 1
      });
      tl.to(section, {
        scale: 0.8,
        scrollTrigger: {
          trigger: section,
          pin: section,
          scrub: 1,
          start: "top 0",
          end: "bottom 70%",
          endTrigger: ".bw-portfolio-wrap",
          pinSpacing: false,
          markers: false
        }
      });
    });
  });

  // Marquee - Two Lines , One Line To Right, One Line To Left
  function addHoverPause(el, timeline) {
    el.addEventListener("mouseenter", () => timeline.pause());
    el.addEventListener("mouseleave", () => timeline.resume());
  }

  const inibwarquees = () => {
    const containers = [...document.querySelectorAll(".marquee--gsap")];
    if (!containers.length) return;

    containers.forEach((container) => {
      const topEl = container.querySelector(".marquee__top");
      const bottomEl = container.querySelector(".marquee__bottom");

      topEl.innerHbwL += topEl.innerHbwL;
      bottomEl.innerHbwL += bottomEl.innerHbwL;

      const tlTop = gsap.timeline().add(marquee(topEl, 30, "-=50%"), 0);
      const rTop = gsap.to(tlTop, {
        duration: 1.5,
        timeScale: 1,
        paused: true
      });
      const clampTS = gsap.utils.clamp(1, 6);
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (st) => {
          tlTop.timeScale(clampTS(Math.abs(st.getVelocity() / 200)));
          rTop.invalidate().restart();
        }
      });
      addHoverPause(topEl, tlTop);

      const tlBottom = gsap.timeline().add(marquee(bottomEl, 30, "+=50%"), 0);
      const rBottom = gsap.to(tlBottom, {
        duration: 1.5,
        timeScale: 1,
        paused: true
      });
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (st) => {
          tlBottom.timeScale(clampTS(Math.abs(st.getVelocity() / 200)));
          rBottom.invalidate().restart();
        }
      });
      addHoverPause(bottomEl, tlBottom);
    });
  };

  const inibwarquee = () => {
    const containers = [...document.querySelectorAll(".marquee-right--gsap")];
    if (!containers.length) return;

    containers.forEach((container) => {
      const el = container.querySelector(".marquee__toright");
      el.innerHbwL += el.innerHbwL;

      const tl = gsap.timeline().add(marqueeRight(el, 30, "+=50%"), 0);
      const r = gsap.to(tl, { duration: 1.5, timeScale: 1, paused: true });
      const clampTS = gsap.utils.clamp(1, 6);
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (st) => {
          tl.timeScale(clampTS(Math.abs(st.getVelocity() / 200)));
          r.invalidate().restart();
        }
      });

      addHoverPause(el, tl);
    });
  };

  const inibwarqueeLeft = () => {
    const containers = [...document.querySelectorAll(".marquee-left--gsap")];
    if (!containers.length) return;

    containers.forEach((container) => {
      const el = container.querySelector(".marquee__toleft");
      el.innerHbwL += el.innerHbwL;

      const tl = gsap.timeline().add(marquee(el, 30, "-=50%"), 0);
      const r = gsap.to(tl, { duration: 1.5, timeScale: 1, paused: true });
      const clampTS = gsap.utils.clamp(1, 6);
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (st) => {
          tl.timeScale(clampTS(Math.abs(st.getVelocity() / 200)));
          r.invalidate().restart();
        }
      });

      addHoverPause(el, tl);
    });
  };

  const marquee = (el, duration, x) => {
    const wrap = gsap.utils.wrap(0, 50);
    return gsap.to(el, {
      duration,
      ease: "none",
      x,
      modifiers: { x: (v) => (x = wrap(parseFloat(v)) + "%") },
      repeat: -1
    });
  };

  const marqueeRight = (el, duration, x) => {
    const wrap = gsap.utils.wrap(0, 50);
    return gsap.to(el, {
      duration,
      ease: "none",
      x,
      modifiers: { x: (v) => (x = wrap(parseFloat(v)) + "%") },
      repeat: -1
    });
  };

  // rotate animation
  gsap.utils.toArray(".bw-animate-rotate").forEach((el, index) => {
    let arspin = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        scrub: 1,
        start: "top 100%",
        end: "top -50%",
        toggleActions: "play none none reverse",
        markers: false
      }
    });

    arspin
      .set(el, { transformOrigin: "center center" })
      .fromTo(
        el,
        { rotate: 0 },
        { rotate: 180, duration: 2, immediateRender: false }
      );
  });

  // right to left animation
  if (document.querySelector(".right-to-left-anim")) {
    let counterImgTL = gsap.timeline({
      scrollTrigger: {
        trigger: ".right-to-left-anim",
        start: "top 80%",
        end: "bottom 10%",
        scrub: 2,
        markers: false
      }
    });
    counterImgTL.fromTo(
      ".right-to-left-anim",
      {
        x: 200
      },
      {
        x: 0,
        duration: 1.6
      }
    );
  }

  // left to right animation
  if (document.querySelector(".left-to-right-anim")) {
    let counterImgTL = gsap.timeline({
      scrollTrigger: {
        trigger: ".left-to-right-anim",
        start: "top 80%",
        end: "bottom 10%",
        scrub: 2,
        markers: false
      }
    });
    counterImgTL.fromTo(
      ".left-to-right-anim",
      {
        x: -200
      },
      {
        x: 0,
        duration: 1.6
      }
    );
  }

  // circle shape wrapper
  function circleShapeAnim() {
    if (document.querySelectorAll(".circle-shape-wrapper").length > 0) {
      var cs = gsap.timeline({
        ease: "power2.in",
        backgroundColor: "#fff",
        scrollTrigger: {
          trigger: ".circle-shape-wrapper",
          start: "bottom bottom",
          end: "bottom top",
          pin: true,
          scrub: 1
        }
      });
      cs.to(".circle-shape-wrapper__thumb img", {
        scale: 100,
        rotation: 90,
        autoAlpha: 1,
        delay: 0.1
      });
    }
  }

  // scroll zoom effect
  gsap.utils.toArray(".zoom-effect").forEach((el, index) => {
    let tl1 = gsap.timeline({
      scrollTrigger: {
        trigger: el,
        scrub: 1,
        start: "top 80%",
        end: "buttom 60%",
        toggleActions: "play none none reverse",
        markers: false
      }
    });

    tl1.set(el, { transformOrigin: "center center" }).from(
      el,
      { scale: 0.7 },
      {
        background: "inherit",
        scale: 1,
        duration: 1,
        immediateRender: false
      }
    );
  });

  if ($(".img-reveal-left, .img-reveal-right, .img-reveal-top").length) {
    // image reveal animation
    gsap.set(".img-reveal-left, .img-reveal-right, .img-reveal-top", {
      overflow: "hidden"
    });

    document
      .querySelectorAll(".img-reveal-left, .img-reveal-right, .img-reveal-top")
      .forEach((container) => {
        let image = container.querySelector("img");

        // default values
        let fromX = 0;
        let fromY = 0;
        let imgX = 0;
        let imgY = 0;

        if (container.classList.contains("img-reveal-left")) {
          fromX = -100;
          imgX = 100;
        }

        if (container.classList.contains("img-reveal-right")) {
          fromX = 100;
          imgX = -100;
        }

        if (container.classList.contains("img-reveal-top")) {
          fromY = -100;
          imgY = 100;
        }

        let tl = gsap.timeline({
          scrollTrigger: {
            trigger: container,
            toggleActions: "restart none none reset"
          }
        });

        tl.set(container, { autoAlpha: 1 });

        tl.from(container, {
          xPercent: fromX,
          yPercent: fromY,
          duration: 1.5,
          ease: "power2.out"
        });

        tl.from(
          image,
          {
            xPercent: imgX,
            yPercent: imgY,
            scale: 1.3,
            duration: 1.5,
            ease: "power2.out"
          },
          "-=1.5"
        );
      });
  }

  // scroll scale up image
  document.querySelectorAll(".scale-up-img").forEach((section) => {
    let tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top bottom",
        end: "bottom center",
        scrub: 1,
        markers: false
      }
    });

    tl.to(section.querySelector(".scale-up"), {
      scale: 1.2,
      duration: 1
    });
  });

  // scroll move parallax image
  document.querySelectorAll(".img-move-wrap").forEach((wrapper) => {
    const imgLR = wrapper.querySelector(".img-move-lr");
    const imgRL = wrapper.querySelector(".img-move-rl");
    const isRTL = getComputedStyle(wrapper).direction === "rtl";

    gsap.set(wrapper, { overflow: "hidden" });

    // Function to calculate start and end xPercent for RTL/LTR
    function getXPercent(startLTR, endLTR) {
      return isRTL ? -startLTR : startLTR;
    }

    // LEFT → RIGHT image
    if (imgLR) {
      gsap.set(imgLR, {
        width: "125%",
        maxWidth: "none",
        xPercent: getXPercent(-12.5, 0),
        willChange: "transform"
      });

      gsap.to(imgLR, {
        xPercent: getXPercent(0, 12.5),
        ease: "none",
        scrollTrigger: {
          trigger: wrapper,
          start: "top bottom",
          end: "bottom top",
          scrub: 1
        }
      });
    }

    // RIGHT → LEFT image
    if (imgRL) {
      gsap.set(imgRL, {
        width: "125%",
        maxWidth: "none",
        xPercent: getXPercent(0, -12.5),
        willChange: "transform"
      });

      gsap.to(imgRL, {
        xPercent: getXPercent(-12.5, 0),
        ease: "none",
        scrollTrigger: {
          trigger: wrapper,
          start: "top bottom",
          end: "bottom top",
          scrub: 1
        }
      });
    }
  });

  // bounce animation
  if ($(".bw-bounce-wrap").length > 0) {
    gsap.set(".bw-bounce", {
      y: -150,
      opacity: 0
    });
    var mybtn = gsap.utils.toArray(".bw-bounce");
    mybtn.forEach((item) => {
      var $this = $(item);
      gsap.to(item, {
        scrollTrigger: {
          trigger: $this.closest(".bw-bounce-wrap"),
          start: "top center",
          markers: false
        },
        duration: 1.5,
        delay: 0,
        ease: "bounce.out",
        y: 0,
        opacity: 1
      });
    });
  }

  // expertise area
  if (typeof Matter === "undefined") return;

  const scene = document.querySelector("[data-t-throwable-scene]");
  if (!scene) return;

  const items = scene.querySelectorAll("[data-t-throwable-el]");
  const bounds = scene.getBoundingClientRect();

  const { Engine, World, Bodies, Mouse, MouseConstraint, Runner } = Matter;

  const engine = Engine.create();
  engine.gravity.y = 0;

  /* Walls to lock capsules inside section */
  const wallThickness = 50;
  const walls = [
    Bodies.rectangle(
      bounds.width / 2,
      -wallThickness,
      bounds.width,
      wallThickness * 2,
      { isStatic: true }
    ),
    Bodies.rectangle(
      bounds.width / 2,
      bounds.height + wallThickness,
      bounds.width,
      wallThickness * 2,
      { isStatic: true }
    ),
    Bodies.rectangle(
      -wallThickness,
      bounds.height / 2,
      wallThickness * 2,
      bounds.height,
      { isStatic: true }
    ),
    Bodies.rectangle(
      bounds.width + wallThickness,
      bounds.height / 2,
      wallThickness * 2,
      bounds.height,
      { isStatic: true }
    )
  ];
  World.add(engine.world, walls);

  /* Capsule bodies */
  const bodies = [];
  items.forEach((el) => {
    const r = el.getBoundingClientRect();
    const radius = r.width / 2;

    const body = Bodies.circle(
      r.left - bounds.left + radius,
      r.top - bounds.top + radius,
      radius,
      { restitution: 0.9, frictionAir: 0.04 }
    );

    body.el = el;
    bodies.push(body);
    World.add(engine.world, body);
  });

  /* Mouse drag */
  // const mouse = Mouse.create(document.body);
  const mouse = Mouse.create(scene);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    constraint: {
      stiffness: 0.15,
      render: { visible: false }
    }
  });
  World.add(engine.world, mouseConstraint);

  /* Render GSAP */
  (function update() {
    bodies.forEach((body) => {
      gsap.set(body.el, {
        x: body.position.x,
        y: body.position.y,
        rotation: (body.angle * 180) / Math.PI
      });
    });
    requestAnimationFrame(update);
  })();

  Runner.run(engine);
})(jQuery);
