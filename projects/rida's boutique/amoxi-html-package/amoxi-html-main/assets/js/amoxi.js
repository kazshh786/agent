(function ($) {
  "use strict";

  /* hero slider title animation */
  function heroTitle() {
    $(".hero-title").each(function () {
      const originalHtml = $(this).html();
      let newHtml = "";
      let i = 0;
      let delay = 0.05;
      let insideTag = false;
      let tagBuffer = "";
      let tagStack = [];

      function wrapWord(word, isManualDiv = false) {
        let result = isManualDiv ? "" : '<span style="display:inline-block;">';
        for (let j = 0; j < word.length; j++) {
          const char = word[j];
          if (char.trim()) {
            result += `<span style="animation-delay:${delay.toFixed(
              2
            )}s">${char}</span>`;
            delay += 0.05;
          } else {
            result += char;
          }
        }
        if (!isManualDiv) result += "</span>";
        return result;
      }

      let buffer = "";
      let insideManualDiv = false;

      while (i < originalHtml.length) {
        const char = originalHtml[i];

        if (char === "<") {
          if (buffer.trim()) {
            const words = buffer.split(/(\s+)/);
            for (const word of words) {
              if (word.trim()) {
                newHtml += wrapWord(word, insideManualDiv);
              } else {
                newHtml += word;
              }
            }
          } else {
            newHtml += buffer;
          }
          buffer = "";
          insideTag = true;
          tagBuffer = "<";
        } else if (insideTag) {
          tagBuffer += char;
          if (char === ">") {
            insideTag = false;

            const isClosing = /^<\//.test(tagBuffer);
            const tagNameMatch = tagBuffer.match(/^<\/?(\w+)/);
            const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : "";

            if (tagName === "div") {
              if (!isClosing) {
                tagStack.push("div");
                insideManualDiv = true;
              } else {
                tagStack.pop();
                insideManualDiv = tagStack.includes("div");
              }
            }

            newHtml += tagBuffer;
            tagBuffer = "";
          }
        } else {
          buffer += char;
        }

        i++;
      }

      if (buffer.trim()) {
        const words = buffer.split(/(\s+)/);
        for (const word of words) {
          if (word.trim()) {
            newHtml += wrapWord(word, insideManualDiv);
          } else {
            newHtml += word;
          }
        }
      } else {
        newHtml += buffer;
      }

      $(this).html(newHtml);
    });
  }

  // smooth scroll
  function smoothScroll() {
    $(".smooth-scroll").on("click", function (event) {
      var target = $(this.getAttribute("href"));
      if (target.length) {
        event.preventDefault();
        $("html, body")
          .stop()
          .animate(
            {
              scrollTop: target.offset().top - -60
            },
            1500
          );
      }
    });
  }
  smoothScroll();

  // blog 06 hover
  $(".blog-six__row .blog-six__item").on("mousemove", function () {
    $(".blog-six__row .blog-six__item").removeClass("active");
    $(this).addClass("active");
  });

  // package card hover
  $(".package-card, .package-card-two").on("mouseenter", function () {
    $(".package-card, .package-card-two").removeClass("active");
    $(this).addClass("active");
  });

  // services card 02 & blog card 02 hover
  function slideToggleOnHover(parent, child) {
    $(parent)
      .on("mouseenter", function () {
        $(this).find(child).stop(true, true).slideDown(300);
      })
      .on("mouseleave", function () {
        $(this).find(child).stop(true, true).slideUp(300);
      });
  }

  slideToggleOnHover(".blog-two__item", ".blog-two__item__text");
  slideToggleOnHover(".services-two__item", ".services-two__item__tags");

  // packages 01 card
  function togglePackages(isYearly) {
    $(".packages-one__monthly").toggle(!isYearly);
    $(".packages-one__yearly").toggle(isYearly);

    $(".packages-one__monthly, .packages-one__yearly")
      .removeClass("active")
      .filter(isYearly ? ".packages-one__yearly" : ".packages-one__monthly")
      .addClass("active");

    $(".packages-one__switch__text").removeClass("active");
    $(isYearly ? ".yearly-package" : ".monthly-package").addClass("active");

    $("#priceSwitch").prop("checked", isYearly);
  }

  $("#priceSwitch").on("change", function () {
    togglePackages($(this).is(":checked"));
  });

  $(".monthly-package").on("click", function () {
    togglePackages(false);
  });

  $(".yearly-package").on("click", function () {
    togglePackages(true);
  });

  togglePackages(false);

  // awards item hover
  $(".awards-two__item").on("mouseenter", function () {
    var index = $(this).index();
    $(".awards-two__image").removeClass("active").eq(index).addClass("active");
    $(".awards-two__item").removeClass("active");
    $(this).addClass("active");
  });

  $(".awards-two__item").on("mouseleave", function () {
    var $defaultItem = $(".awards-two__item.active:first");
    var defaultIndex = $defaultItem.index();

    $(".awards-two__image")
      .removeClass("active")
      .eq(defaultIndex)
      .addClass("active");
  });

  // Ripples Animation
  $(".ripple-animation").each(function () {
    let filterEl = document.querySelector(
      '.ripple-svg-one [type="fractalNoise"]'
    );
    let tl = new TimelineMax({
      repeat: -1
    });

    tl.to(
      filterEl,
      10,
      {
        attr: {
          baseFrequency: "0.001 0.004"
        }
      },
      0
    );

    // tl.play();
    $(this).mouseover(function () {
      this.style.filter = "url(#warp)";
      tl.play();
      tl.yoyo(true);
    });
    $(this).mouseout(function () {
      this.style.filter = "none";
      tl.reverse();
      tl.yoyo(false);
    });
    let filterEl2 = document.querySelector(
      '.ripple-svg-two [type="fractalNoise"]'
    );
    let tl2 = new TimelineMax({
      repeat: -1
    });

    tl2.to(
      filterEl2,
      3,
      {
        attr: {
          baseFrequency: "0.0005 0.0005"
        }
      },
      0
    );

    tl2.yoyo(true);
  });

  /*-- Checkout Accoradin --*/
  if ($(".checkout-page__payment__title").length) {
    $(".checkout-page__payment__item")
      .find(".checkout-page__payment__content")
      .hide();
    $(".checkout-page__payment__item--active")
      .find(".checkout-page__payment__content")
      .show();
    $(".checkout-page__payment__title").on("click", function (e) {
      e.preventDefault();
      $(this)
        .parents(".checkout-page__payment")
        .find(".checkout-page__payment__item")
        .removeClass("checkout-page__payment__item--active");
      $(this)
        .parents(".checkout-page__payment")
        .find(".checkout-page__payment__content")
        .slideUp();
      $(this).parent().addClass("checkout-page__payment__item--active");
      $(this).parent().find(".checkout-page__payment__content").slideDown();
    });
  }

  let dynamicyearElm = $(".dynamic-year");
  if (dynamicyearElm.length) {
    let currentYear = new Date().getFullYear();
    dynamicyearElm.html(currentYear);
  }

  // Date Picker
  if ($(".amoxi-datepicker").length) {
    $(".amoxi-datepicker").each(function () {
      $(this).datepicker();
    });
  }

  // Popular Causes Progress Bar
  if ($(".count-bar").length) {
    $(".count-bar").appear(
      function () {
        var el = $(this);
        var percent = el.data("percent");
        $(el).css("width", percent).addClass("counted");
      },
      {
        accY: -50
      }
    );
  }

  //Fact Counter + Text Count
  if ($(".count-box").length) {
    $(".count-box").appear(
      function () {
        var $t = $(this),
          n = $t.find(".count-text").attr("data-stop"),
          r = parseInt($t.find(".count-text").attr("data-speed"), 10);

        if (!$t.hasClass("counted")) {
          $t.addClass("counted");
          $({
            countNum: $t.find(".count-text").text()
          }).animate(
            {
              countNum: n
            },
            {
              duration: r,
              easing: "linear",
              step: function () {
                $t.find(".count-text").text(Math.floor(this.countNum));
              },
              complete: function () {
                $t.find(".count-text").text(this.countNum);
              }
            }
          );
        }
      },
      {
        accY: 0
      }
    );
  }

  // custom coursor
  if ($(".custom-cursor").length) {
    var cursor = document.querySelector(".custom-cursor__cursor");
    var cursorinner = document.querySelector(".custom-cursor__cursor-two");
    var a = document.querySelectorAll("a");

    document.addEventListener("mousemove", function (e) {
      var x = e.clientX;
      var y = e.clientY;
      cursor.style.transform = `translate3d(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%), 0)`;
    });

    document.addEventListener("mousemove", function (e) {
      var x = e.clientX;
      var y = e.clientY;
      cursorinner.style.left = x + "px";
      cursorinner.style.top = y + "px";
    });

    document.addEventListener("mousedown", function () {
      cursor.classList.add("click");
      cursorinner.classList.add("custom-cursor__innerhover");
    });

    document.addEventListener("mouseup", function () {
      cursor.classList.remove("click");
      cursorinner.classList.remove("custom-cursor__innerhover");
    });

    a.forEach((item) => {
      item.addEventListener("mouseover", () => {
        cursor.classList.add("custom-cursor__hover");
      });
      item.addEventListener("mouseleave", () => {
        cursor.classList.remove("custom-cursor__hover");
      });
    });
  }

  if ($(".contact-form-validated").length) {
    $(".contact-form-validated").validate({
      // initialize the plugin
      rules: {
        name: {
          required: true
        },
        email: {
          required: true,
          email: true
        },
        message: {
          required: true
        },
        subject: {
          required: true
        }
      },
      submitHandler: function (form) {
        // sending value with ajax request
        $.post(
          $(form).attr("action"),
          $(form).serialize(),
          function (response) {
            $(form).parent().find(".result").append(response);
            $(form).find('input[type="text"]').val("");
            $(form).find('input[type="email"]').val("");
            $(form).find("textarea").val("");
          }
        );
        return false;
      }
    });
  }

  // mailchimp form
  if ($(".mc-form").length) {
    $(".mc-form").each(function () {
      var Self = $(this);
      var mcURL = Self.data("url");
      var mcResp = Self.parent().find(".mc-form__response");

      Self.ajaxChimp({
        url: mcURL,
        callback: function (resp) {
          // appending response
          mcResp.append(function () {
            return '<p class="mc-message">' + resp.msg + "</p>";
          });
          // making things based on response
          if (resp.result === "success") {
            // Do stuff
            Self.removeClass("errored").addClass("successed");
            mcResp.removeClass("errored").addClass("successed");
            Self.find("input").val("");

            mcResp.find("p").fadeOut(10000);
          }
          if (resp.result === "error") {
            Self.removeClass("successed").addClass("errored");
            mcResp.removeClass("successed").addClass("errored");
            Self.find("input").val("");

            mcResp.find("p").fadeOut(10000);
          }
        }
      });
    });
  }

  if ($(".video-popup").length) {
    $(".video-popup").magnificPopup({
      type: "iframe",
      mainClass: "mfp-fade",
      removalDelay: 160,
      preloader: true,

      fixedContentPos: false
    });
  }

  if ($(".img-popup").length) {
    var groups = {};
    $(".img-popup").each(function () {
      var id = parseInt($(this).attr("data-group"), 10);

      if (!groups[id]) {
        groups[id] = [];
      }

      groups[id].push(this);
    });

    $.each(groups, function () {
      $(this).magnificPopup({
        type: "image",
        closeOnContentClick: true,
        closeBtnInside: false,
        gallery: {
          enabled: true
        }
      });
    });
  }

  function dynamicCurrentMenuClass(selector) {
    let FileName = window.location.href.split("/").reverse()[0];

    selector.find("li").each(function () {
      let anchor = $(this).find("a");
      if ($(anchor).attr("href") == FileName) {
        $(this).addClass("current");
      }
    });
    // if any li has .current elmnt add class
    selector.children("li").each(function () {
      if ($(this).find(".current").length) {
        $(this).addClass("current");
      }
    });
    // if no file name return
    if ("" == FileName) {
      selector.find("li").eq(0).addClass("current");
    }
  }

  if ($(".main-menu__list").length) {
    // dynamic current class
    let mainNavUL = $(".main-menu__list");
    dynamicCurrentMenuClass(mainNavUL);
  }

  if ($(".service-details__nav").length) {
    // dynamic current class
    let mainNavUL = $(".service-details__nav");
    dynamicCurrentMenuClass(mainNavUL);
  }

  if ($(".main-menu").length && $(".mobile-nav__container").length) {
    let navContent = document.querySelector(".main-menu").innerHTML;
    let mobileNavContainer = document.querySelector(".mobile-nav__container");
    mobileNavContainer.innerHTML = navContent;
  }

  if ($(".sticky-header").length) {
    $(".sticky-header")
      .clone()
      .insertAfter(".sticky-header")
      .addClass("sticky-header--cloned");
  }

  if ($(".mobile-nav__container .main-menu__list").length) {
    let dropdownAnchor = $(
      ".mobile-nav__container .main-menu__list .dropdown > a"
    );
    dropdownAnchor.each(function () {
      let self = $(this);
      let toggleBtn = document.createElement("BUTTON");
      toggleBtn.setAttribute("aria-label", "dropdown toggler");
      toggleBtn.innerHTML = "<i class='fa fa-angle-down'></i>";
      self.append(function () {
        return toggleBtn;
      });
      self.find("button").on("click", function (e) {
        e.preventDefault();
        let self = $(this);
        self.toggleClass("expanded");
        self.parent().toggleClass("expanded");
        self.parent().parent().children("ul").slideToggle();
      });
    });
  }

  //Show Popup menu
  $(document).on("click", ".megamenu-clickable--toggler > a", function (e) {
    $("body").toggleClass("megamenu-popup-active");
    $(this).parent().find("ul").toggleClass("megamenu-clickable--active");
    e.preventDefault();
  });
  $(document).on("click", ".megamenu-clickable--close", function (e) {
    $("body").removeClass("megamenu-popup-active");
    $(".megamenu-clickable--active").removeClass("megamenu-clickable--active");
    e.preventDefault();
  });

  if ($(".mobile-nav__toggler").length) {
    $(".mobile-nav__toggler").on("click", function (e) {
      e.preventDefault();
      $(".mobile-nav__wrapper").toggleClass("expanded");
      $("body").toggleClass("locked");
    });
  }

  if ($(".sidebar-btn__toggler").length) {
    $(".sidebar-btn__toggler").on("click", function (e) {
      e.preventDefault();
      $(".sidebar-three").toggleClass("active");
      $("body").toggleClass("locked");
    });
  }

  if ($(".search-toggler").length) {
    $(".search-toggler").on("click", function (e) {
      e.preventDefault();
      $(".search-popup").toggleClass("active");
      $(".mobile-nav__wrapper").removeClass("expanded");
      $("body").toggleClass("locked");
    });
  }
  if ($(".mini-cart__toggler").length) {
    $(".mini-cart__toggler").on("click", function (e) {
      e.preventDefault();
      $(".mini-cart").toggleClass("expanded");
      $(".mobile-nav__wrapper").removeClass("expanded");
      $("body").toggleClass("locked");
    });
  }
  if ($(".odometer").length) {
    $(".odometer").appear(function (e) {
      var odo = $(".odometer");
      odo.each(function () {
        var countNumber = $(this).attr("data-count");
        $(this).html(countNumber);
      });
    });
  }

  //accordion
  if ($(".amoxi-accordion").length) {
    var accordionGrp = $(".amoxi-accordion");
    accordionGrp.each(function () {
      var accordionName = $(this).data("grp-name");
      var Self = $(this);
      var accordion = Self.find(".accordion");
      Self.addClass(accordionName);
      Self.find(".accordion .accordion-content").hide();
      Self.find(".accordion.active").find(".accordion-content").show();
      accordion.each(function () {
        $(this)
          .find(".accordion-title")
          .on("click", function () {
            if ($(this).parent().hasClass("active") === false) {
              $(".amoxi-accordion." + accordionName)
                .find(".accordion")
                .removeClass("active");
              $(".amoxi-accordion." + accordionName)
                .find(".accordion")
                .find(".accordion-content")
                .slideUp();
              $(this).parent().addClass("active");
              $(this).parent().find(".accordion-content").slideDown();
            }
          });
      });
    });
  }

  $(".add").on("click", function () {
    if ($(this).prev().val() < 999) {
      $(this)
        .prev()
        .val(+$(this).prev().val() + 1);
    }
  });

  $(".sub").on("click", function () {
    if ($(this).next().val() > 0) {
      if ($(this).next().val() > 0)
        $(this)
          .next()
          .val(+$(this).next().val() - 1);
    }
  });

  const items = document.querySelectorAll(".service-item");

  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
    });
  });

  if ($(".tabs-box").length) {
    $(".tabs-box .tab-buttons .tab-btn").on("click", function (e) {
      e.preventDefault();
      var target = $($(this).attr("data-tab"));

      if ($(target).is(":visible")) {
        return false;
      } else {
        target
          .parents(".tabs-box")
          .find(".tab-buttons")
          .find(".tab-btn")
          .removeClass("active-btn");
        $(this).addClass("active-btn");
        target
          .parents(".tabs-box")
          .find(".tabs-content")
          .find(".tab")
          .fadeOut(0);
        target
          .parents(".tabs-box")
          .find(".tabs-content")
          .find(".tab")
          .removeClass("active-tab");
        $(target).fadeIn(300);
        $(target).addClass("active-tab");
      }
    });
  }

  function thmOwlInit() {
    // owl slider
    let amoxiowlCarousel = $(".amoxi-owl__carousel");
    if (amoxiowlCarousel.length) {
      amoxiowlCarousel.each(function () {
        let elm = $(this);
        let options = elm.data("owl-options");
        let thmOwlCarousel = elm.owlCarousel(
          "object" === typeof options ? options : JSON.parse(options)
        );
        elm.find("button").each(function () {
          $(this).attr("aria-label", "carousel button");
        });
      });
    }
    let amoxiowlCarouselNav = $(".amoxi-owl__carousel--custom-nav");
    if (amoxiowlCarouselNav.length) {
      amoxiowlCarouselNav.each(function () {
        let elm = $(this);
        let owlNavPrev = elm.data("owl-nav-prev");
        let owlNavNext = elm.data("owl-nav-next");
        $(owlNavPrev).on("click", function (e) {
          elm.trigger("prev.owl.carousel");
          e.preventDefault();
        });

        $(owlNavNext).on("click", function (e) {
          elm.trigger("next.owl.carousel");
          e.preventDefault();
        });
      });
    }
    let amoxiowlCarouselCustomDots = $(".amoxi-owl__carousel--custom-dots");
    if (amoxiowlCarouselCustomDots.length) {
      amoxiowlCarouselCustomDots.each(function () {
        let elm = $(this);
        let amoxiowlCarouselThumb = elm.data("thumb-elm");
        $(amoxiowlCarouselThumb).each(function () {
          let self = $(this);
          self.find(".owl-dot").on("click", function () {
            elm.trigger("to.owl.carousel", [$(this).index(), 300]);
          });
        });
        elm.on("changed.owl.carousel", function (element) {
          $(amoxiowlCarouselThumb).each(function () {
            let self = $(this);
            self.find(".owl-dot").removeClass("active");
            self.find(".owl-dot").eq(element.item.index).addClass("active");
          });
        });
      });
    }
  }

  function amoxiSwiperInit() {
    // swiper slider
    let swipers = $(".amoxi-swiper__carousel");

    if (swipers.length) {
      swipers.each(function (index, element) {
        let $this = $(element);
        let options = $this.attr("data-swiper-options");
        let parsedOptions;

        try {
          parsedOptions = JSON.parse(options);
        } catch (e) {
          console.warn("Invalid JSON in data-swiper-options:", e);
          parsedOptions = {};
        }

        new Swiper(element, parsedOptions);
      });
    }
  }

  function initPortfolioTwoSwiperEnhancements() {
    const carousels = document.querySelectorAll(".portfolio-two__carousel");

    carousels.forEach((el) => {
      if (!el.swiper) return;

      const swiper = el.swiper;

      const update = () => {
        applyVisibleOrderClasses(swiper);
        applyOddCenterClass(swiper);
      };

      swiper.on("init", update);
      swiper.on("slideChange", update);
      swiper.on("resize", update);

      // initial run (important for loop / coverflow)
      update();
    });
  }

  function applyVisibleOrderClasses(swiper) {
    const orderClasses = [
      "is-one",
      "is-two",
      "is-three",
      "is-four",
      "is-five",
      "is-six",
      "is-seven",
      "is-eight",
      "is-nine",
      "is-ten"
    ];

    swiper.slides.forEach((slide) => {
      orderClasses.forEach((cls) => slide.classList.remove(cls));
    });

    const visibleSlides = swiper.slides.filter((slide) =>
      slide.classList.contains("swiper-slide-visible")
    );

    visibleSlides.forEach((slide, index) => {
      if (orderClasses[index]) {
        slide.classList.add(orderClasses[index]);
      }
    });
  }

  function applyOddCenterClass(swiper) {
    swiper.slides.forEach((slide) => slide.classList.remove("center"));

    const visibleSlides = swiper.slides.filter((slide) =>
      slide.classList.contains("swiper-slide-visible")
    );

    if (visibleSlides.length % 2 === 1) {
      const middleIndex = Math.floor(visibleSlides.length / 2);
      visibleSlides[middleIndex].classList.add("center");
    }
  }

  function amoxiSlickInit() {
    // slick slider
    let amoxislickCarousel = $(".amoxi-slick__carousel");
    if (amoxislickCarousel.length) {
      amoxislickCarousel.each(function () {
        let elm = $(this);
        let options = elm.data("slick-options");
        let amoxislickCarousel = elm.slick(
          "object" === typeof options ? options : JSON.parse(options)
        );
      });
    }
    let amoxislickCarouselCounter = $(".amoxi-slick__custome-counter");
    if (amoxislickCarouselCounter.length) {
      amoxislickCarouselCounter.each(function () {
        let elm = $(this);
        let options = elm.data("slick-options");
        let currentSlide;
        let slidesCount;
        let sliderCounter = document.createElement("div");
        sliderCounter.classList.add("amoxi-slick__counter");

        let updateSliderCounter = function (slick, currentIndex) {
          currentSlide = slick.slickCurrentSlide() + 1;
          slidesCount = slick.slideCount;
          $(sliderCounter).html(
            '<span class="amoxi-slick__counter__active">' +
              currentSlide +
              "</span>" +
              "" +
              "<span>" +
              slidesCount +
              "</span>"
          );
        };
        elm.on("init", function (event, slick) {
          elm.append(sliderCounter);
          updateSliderCounter(slick);
        });
        elm.on("afterChange", function (event, slick, currentSlide) {
          updateSliderCounter(slick, currentSlide);
        });

        let amoxislickCarousel = elm.slick(
          "object" === typeof options ? options : JSON.parse(options)
        );
      });
    }
  }

  // Hover Image
  const link = document.querySelectorAll(".hover-item");
  const linkHoverReveal = document.querySelectorAll(".hover-item__box");
  const linkImages = document.querySelectorAll(".hover-item__box-img");
  for (let i = 0; i < link.length; i++) {
    link[i].addEventListener("mousemove", (e) => {
      linkHoverReveal[i].style.opacity = 1;
      linkHoverReveal[
        i
      ].style.transform = `translate(-100%, -50% ) rotate(14deg)`;
      linkImages[i].style.transform = "scale(1, 1)";
      linkHoverReveal[i].style.left = e.clientX + "px";
    });
    link[i].addEventListener("mouseleave", (e) => {
      linkHoverReveal[i].style.opacity = 0;
      linkHoverReveal[
        i
      ].style.transform = `translate(-50%, -50%) rotate(-14deg)`;
      linkImages[i].style.transform = "scale(0.8, 0.8)";
    });
  }

  /*-- Handle Scrollbar --*/
  function handleScrollbar() {
    const bodyHeight = $("body").height();
    const scrollPos = $(window).innerHeight() + $(window).scrollTop();
    let percentage = (scrollPos / bodyHeight) * 100;
    if (percentage > 100) {
      percentage = 100;
    }
    $(".scroll-to-top .scroll-to-top__inner").css("width", percentage + "%");
  }

  /*-- One Page Menu --*/
  function SmoothMenuScroll() {
    var anchor = $(".scrollToLink");
    if (anchor.length) {
      anchor.children("a").bind("click", function (event) {
        if ($(window).scrollTop() > 10) {
          var headerH = "0";
        } else {
          var headerH = "0";
        }
        var target = $(this);
        $("html, body")
          .stop()
          .animate(
            {
              scrollTop: $(target.attr("href")).offset().top - headerH + "px"
            },
            900,
            "easeInOutExpo"
          );
        anchor.removeClass("current");
        anchor.removeClass("current-menu-ancestor");
        anchor.removeClass("current_page_item");
        anchor.removeClass("current-menu-parent");
        target.parent().addClass("current");
        event.preventDefault();
      });
    }
  }
  SmoothMenuScroll();

  function OnePageMenuScroll() {
    var windscroll = $(window).scrollTop();
    if (windscroll >= 117) {
      var menuAnchor = $(".one-page-scroll-menu .scrollToLink").children("a");
      menuAnchor.each(function () {
        var sections = $(this).attr("href");
        $(sections).each(function () {
          if ($(this).offset().top <= windscroll + 100) {
            var Sectionid = $(sections).attr("id");
            $(".one-page-scroll-menu").find("li").removeClass("current");
            $(".one-page-scroll-menu")
              .find("li")
              .removeClass("current-menu-ancestor");
            $(".one-page-scroll-menu")
              .find("li")
              .removeClass("current_page_item");
            $(".one-page-scroll-menu")
              .find("li")
              .removeClass("current-menu-parent");
            $(".one-page-scroll-menu")
              .find("a[href*=\\#" + Sectionid + "]")
              .parent()
              .addClass("current");
          }
        });
      });
    } else {
      $(".one-page-scroll-menu li.current").removeClass("current");
      $(".one-page-scroll-menu li:first").addClass("current");
    }
  }

  // window scroll event
  function stickyMenuUpScroll($targetMenu, $toggleClass) {
    var lastScrollTop = 0;
    window.addEventListener(
      "scroll",
      function () {
        var st = window.pageYOffset || document.documentElement.scrollTop;
        if (st > 500) {
          if (st > lastScrollTop) {
            // downscroll code
            $targetMenu.removeClass($toggleClass);
            // console.log("down");
          } else {
            // upscroll code
            $targetMenu.addClass($toggleClass);
            // console.log("up");
          }
        } else {
          $targetMenu.removeClass($toggleClass);
        }
        lastScrollTop = st;
      },
      false
    );
  }
  stickyMenuUpScroll($(".sticky-header--normal"), "active");

  //Strech Column
  function amoxi_stretch() {
    var i = $(window).width();
    $(".row .amoxi-stretch-element-inside-column").each(function () {
      var $this = $(this),
        row = $this.closest(".row"),
        cols = $this.closest('[class^="col-"]'),
        colsheight = $this.closest('[class^="col-"]').height(),
        rect = this.getBoundingClientRect(),
        l = row[0].getBoundingClientRect(),
        s = cols[0].getBoundingClientRect(),
        r = rect.left,
        d = i - rect.right,
        c = l.left + (parseFloat(row.css("padding-left")) || 0),
        u = i - l.right + (parseFloat(row.css("padding-right")) || 0),
        p = s.left,
        f = i - s.right,
        styles = {
          "margin-left": 0,
          "margin-right": 0
        };
      if (Math.round(c) === Math.round(p)) {
        var h = parseFloat($this.css("margin-left") || 0);
        styles["margin-left"] = h - r;
      }
      if (Math.round(u) === Math.round(f)) {
        var w = parseFloat($this.css("margin-right") || 0);
        styles["margin-right"] = w - d;
      }
      $this.css(styles);
    });
  }
  amoxi_stretch();

  function amoxi_cuved_circle() {
    let circleTypeElm = $(".curved-circle--item");
    if (circleTypeElm.length) {
      circleTypeElm.each(function () {
        let elm = $(this);
        let options = elm.data("circle-text-options");
        elm.circleType(
          "object" === typeof options ? options : JSON.parse(options)
        );
      });
    }
  }

  /*-- Price Range --*/
  function priceFilter() {
    if ($(".price-ranger").length) {
      $(".price-ranger #slider-range").slider({
        range: true,
        min: 50,
        max: 1000,
        values: [11, 500],
        slide: function (event, ui) {
          $(".price-ranger .ranger-min-max-block .min").val("$" + ui.values[0]);
          $(".price-ranger .ranger-min-max-block .max").val("$" + ui.values[1]);
        }
      });
      $(".price-ranger .ranger-min-max-block .min").val(
        "$" + $(".price-ranger #slider-range").slider("values", 0)
      );
      $(".price-ranger .ranger-min-max-block .max").val(
        "$" + $(".price-ranger #slider-range").slider("values", 1)
      );
    }
  }

  // window load event
  $(window).on("load", function () {
    if ($(".preloader").length) {
      $(".preloader").fadeOut();
    }

    heroTitle();
    thmOwlInit();
    amoxiSwiperInit();
    initPortfolioTwoSwiperEnhancements();
    amoxiSlickInit();
    priceFilter();

    if ($(".circle-progress").length) {
      $(".circle-progress").appear(function () {
        let circleProgress = $(".circle-progress");
        circleProgress.each(function () {
          let progress = $(this);
          let progressOptions = progress.data("options");
          progress.circleProgress(progressOptions);
        });
      });
    }
    if ($(".masonry-layout").length) {
      $(".masonry-layout").imagesLoaded(function () {
        $(".masonry-layout").isotope({
          layoutMode: "masonry"
        });
      });
    }
    if ($(".fitRow-layout").length) {
      $(".fitRow-layout").imagesLoaded(function () {
        $(".fitRow-layout").isotope({
          layoutMode: "fitRows"
        });
      });
    }

    if ($(".post-filter").length) {
      var postFilterList = $(".post-filter li");
      // for first init
      $(".filter-layout").isotope({
        filter: ".filter-item",
        animationOptions: {
          duration: 500,
          easing: "linear",
          queue: false
        }
      });
      // on click filter links
      postFilterList.on("click", function () {
        var Self = $(this);
        var selector = Self.attr("data-filter");
        postFilterList.removeClass("active");
        Self.addClass("active");

        $(".filter-layout").isotope({
          filter: selector,
          animationOptions: {
            duration: 500,
            easing: "linear",
            queue: false
          }
        });
        return false;
      });
    }

    if ($(".post-filter.has-dynamic-filter-counter").length) {
      // var allItem = $('.single-filter-item').length;

      var activeFilterItem = $(".post-filter.has-dynamic-filter-counter").find(
        "li"
      );

      activeFilterItem.each(function () {
        var filterElement = $(this).data("filter");
        var count = $(".filter-layout").find(filterElement).length;
        $(this).append("<sup>[" + count + "]</sup>");
      });
    }

    amoxi_cuved_circle();
    AOS.init();
  });

  $(window).on("scroll", function () {
    OnePageMenuScroll();
    handleScrollbar();
    if ($(".sticky-header--one-page").length) {
      var headerScrollPos = 130;
      var stricky = $(".sticky-header--one-page");
      if ($(window).scrollTop() > headerScrollPos) {
        stricky.addClass("active");
      } else if ($(this).scrollTop() <= headerScrollPos) {
        stricky.removeClass("active");
      }
    }

    var scrollToTopBtn = ".scroll-to-top";
    if (scrollToTopBtn.length) {
      if ($(window).scrollTop() > 500) {
        $(scrollToTopBtn).addClass("show");
      } else {
        $(scrollToTopBtn).removeClass("show");
      }
    }
  });

  $(window).on("resize", function () {
    amoxi_stretch();
  });
})(jQuery);
