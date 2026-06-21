// ===== register.js =====
// Tambahkan <script src="register.js"></script> sebelum </body> di register.html
// Pastikan <form> punya id="registerForm" dan input punya id="username", id="email", id="password"
// Tambahkan <p id="errorMsg" style="display: none;"></p> dan <p id="successMsg" style="display: none;"></p>

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const errorMsg = document.getElementById('errorMsg');
  const successMsg = document.getElementById('successMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorMsg.textContent = data.message;
        errorMsg.style.display = 'block';
        successMsg.style.display = 'none';
        return;
      }

      successMsg.textContent = data.message;
      successMsg.style.display = 'block';
      errorMsg.style.display = 'none';

      // Redirect ke login setelah 1.5 detik (fade out right before navigating)
      setTimeout(() => {
        document.body.classList.remove('page-ready');
        setTimeout(() => { window.location.href = '/login'; }, 180);
      }, 1500);
    } catch (err) {
      errorMsg.textContent = 'Tidak bisa terhubung ke server';
      errorMsg.style.display = 'block';
    }
  });
});