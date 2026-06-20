document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorMsg.classList.add("hidden");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      console.log("Response:", data);

      if (!response.ok) {
        errorMsg.textContent =
          data.message || "Email atau password salah";
        errorMsg.classList.remove("hidden");
        return;
      }

      // Simpan token jika ada
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      // Redirect berdasarkan role
      if (data.user?.role === "admin") {
        window.location.href = "/admin";
      } else {
        window.location.href = "/home";
      }

    } catch (error) {
      console.error(error);

      errorMsg.textContent =
        "Tidak dapat terhubung ke server";

      errorMsg.classList.remove("hidden");
    }
  });
});