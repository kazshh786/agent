(function ($) {
  "use strict";

  if ($(".dynamic-year").length) {
    let currentYear = new Date().getFullYear();
    $(".dynamic-year").html(currentYear);
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
              scrollTop: target.offset().top - -60,
            },
            1500,
          );
      }
    });
  }
  smoothScroll();

  // window load event
  $(window).on("load", function () {
    //AOS
    AOS.init();
  });
})(jQuery);
