document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupLink = document.getElementById('showSignup');
    const showLoginLink = document.getElementById('showLogin');
    
    // Title UI updates
    const formTitle = document.getElementById('formTitle');
    const formSubtitle = document.getElementById('formSubtitle');

    showSignupLink.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        formTitle.innerText = "Create an account";
        formSubtitle.innerText = "Set up your owner credentials.";
    });

    showLoginLink.addEventListener('click', () => {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        formTitle.innerText = "Welcome back";
        formSubtitle.innerText = "Please enter your details to sign in.";
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginBtn');
        
        btn.innerText = "Signing in...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                window.location.href = '/app';
            } else {
                alert(`Login Failed: ${data.error}`);
            }
        } catch (error) {
            alert('A network error occurred. Please try again.');
        } finally {
            btn.innerText = "Sign In";
            btn.disabled = false;
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value;
        const password = document.getElementById('signupPassword').value;
        const securityKey = document.getElementById('signupSecurityKey').value; // Get the Security Key
        const btn = document.getElementById('signupBtn');
        
        btn.innerText = "Creating...";
        btn.disabled = true;

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username: username, 
                    password: password, 
                    security_key: securityKey // Send key to backend
                }) 
            });

            const data = await response.json();

            if (response.ok) {
                alert('Account created successfully! You can now log in.');
                showLoginLink.click();
                document.getElementById('loginUsername').value = username;
                document.getElementById('loginPassword').value = '';
                document.getElementById('signupSecurityKey').value = ''; 
            } else {
                alert(`Signup Failed: ${data.error}`);
            }
        } catch (error) {
            alert('A network error occurred. Please try again.');
        } finally {
            btn.innerText = "Create Account";
            btn.disabled = false;
        }
    });
});