(() => {
  "use strict";

  const dialog = document.querySelector("#lightbox");
  const dialogImage = dialog.querySelector("img");

  document.querySelectorAll("[data-jury-launch]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      window.location.assign(new URL("index.html?jury", window.location.href).href);
    });
  });

  document.querySelectorAll("[data-game-launch]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      window.location.assign(new URL("index.html", window.location.href).href);
    });
  });

  document.querySelectorAll(".gallery-item").forEach(button => {
    button.addEventListener("click", () => {
      dialogImage.src = button.dataset.image;
      dialogImage.alt = button.querySelector("img").alt;
      dialog.showModal();
    });
  });

  dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
})();
