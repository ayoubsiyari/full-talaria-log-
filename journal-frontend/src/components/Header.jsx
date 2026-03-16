<button
  onClick={() => {
    localStorage.removeItem('token');
    window.location.href = '/journal/login';
  }}
  className="text-red-600 hover:underline"
>
  Logout
</button>
