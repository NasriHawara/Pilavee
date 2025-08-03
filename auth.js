// auth.js

// Import Firebase Authentication and Firestore services
import { auth, db } from './firebase-init.js'; // Ensure db is imported
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    doc,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


// Global variable to store the current user's profile data
export let currentUserProfile = null;

// A Promise that resolves when the user's auth state and profile are loaded
let resolveUserProfileReady;
export const userProfileReadyPromise = new Promise(resolve => {
    resolveUserProfileReady = resolve;
});


// --- Helper function to display messages (reused from booking.js) ---
function showMessage(message, isError = false) {
    const messageContainer = document.getElementById('auth-message');
    if (!messageContainer) {
        console.warn("Auth message container not found. Message:", message);
        return;
    }

    // Clear previous timeout if any
    if (messageContainer.timeoutId) {
        clearTimeout(messageContainer.timeoutId);
    }

    messageContainer.textContent = message;
    messageContainer.className = 'message-container'; // Reset classes
    if (isError) {
        messageContainer.classList.add('error');
    } else {
        messageContainer.classList.add('success');
    }
    messageContainer.style.opacity = '1';

    messageContainer.timeoutId = setTimeout(() => {
        messageContainer.style.opacity = '0';
        setTimeout(() => {
            messageContainer.textContent = '';
            messageContainer.className = 'message-container'; // Clear classes
        }, 300); // Wait for fade out
    }, 5000);
}


// --- Fetch User Profile Data ---
async function fetchUserProfile(uid) {
    if (!db) {
        console.error("Firestore DB not initialized.");
        return null;
    }
    try {
        const userProfileRef = doc(db, "userProfiles", uid);
        const userProfileSnap = await getDoc(userProfileRef);
        if (userProfileSnap.exists()) {
            return userProfileSnap.data();
        } else {
            console.log("No user profile found for UID:", uid);
            return null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null;
    }
}

// --- Helper function to check if user is admin (client-side check) ---
async function checkIfAdmin(uid) {
    if (!db || !uid) return false;
    try {
        const adminDocRef = doc(db, "adminRoles", uid);
        const adminDocSnap = await getDoc(adminDocRef);
        return adminDocSnap.exists() && adminDocSnap.data().isAdmin === true;
    } catch (error) {
        console.error("Error checking admin role client-side:", error);
        return false;
    }
}


// --- Navbar Auth Link Management ---
const authLink = document.getElementById('auth-link');

// Listen for authentication state changes
onAuthStateChanged(auth, async (user) => {
    if (authLink) {
        if (user) {
            // User is signed in
            authLink.textContent = 'Profile';
            authLink.href = 'profile.html';
            // Fetch user profile when signed in
            currentUserProfile = await fetchUserProfile(user.uid);
            console.log("Current User Profile:", currentUserProfile); // Debugging

            // NEW: If user is admin, show Admin Panel link in navbar
            const isAdminUser = await checkIfAdmin(user.uid);
            if (isAdminUser) {
                if (!document.getElementById('admin-nav-link')) { // Prevent adding multiple times
                    const adminNavLinkLi = document.createElement('li');
                    adminNavLinkLi.innerHTML = `<a href="admin.html" id="admin-nav-link" class="button secondary-button">Admin Panel</a>`;
                    authLink.parentElement.after(adminNavLinkLi); // Insert after auth-link's parent <li>
                }
            } else {
                // If user is not admin, ensure admin nav link is removed if it exists
                const existingAdminNavLink = document.getElementById('admin-nav-link');
                if (existingAdminNavLink && existingAdminNavLink.parentElement) {
                    existingAdminNavLink.parentElement.remove();
                }
            }

        } else {
            // User is signed out
            authLink.textContent = 'Login';
            authLink.href = 'login.html';
            authLink.classList.add('button', 'secondary-button');
            currentUserProfile = null; // Clear profile on logout
            // Remove admin nav link if user logs out
            const existingAdminNavLink = document.getElementById('admin-nav-link');
            if (existingAdminNavLink && existingAdminNavLink.parentElement) {
                existingAdminNavLink.parentElement.remove();
            }
        }
    }
    // Resolve the promise once auth state and profile are handled
    resolveUserProfileReady();

    // --- Profile Page Specific Logic ---
    if (window.location.pathname.endsWith('/profile.html')) {
        const userEmailSpan = document.getElementById('user-email');
        const userUidSpan = document.getElementById('user-uid');
        const logoutButton = document.getElementById('logout-button');
        const bookingsMessage = document.getElementById('bookings-message');
        const bookingListDiv = document.getElementById('booking-list');

        if (user) {
            // Display user info
            if (userEmailSpan) userEmailSpan.textContent = user.email || 'N/A';
            if (userUidSpan) userUidSpan.textContent = user.uid;

            // Display additional profile info if available
            if (currentUserProfile) {
                // Ensure these elements are added only once
                if (!document.getElementById('profile-name-p')) {
                    const userNameP = document.createElement('p');
                    userNameP.id = 'profile-name-p'; // Add ID to prevent re-creation
                    userNameP.innerHTML = `<strong>Name:</strong> ${currentUserProfile.firstName || ''} ${currentUserProfile.lastName || ''}`;
                    userEmailSpan.parentElement.insertBefore(userNameP, userEmailSpan); // Insert before email
                }
                if (!document.getElementById('profile-phone-p')) {
                    const userPhoneP = document.createElement('p');
                    userPhoneP.id = 'profile-phone-p'; // Add ID to prevent re-creation
                    userPhoneP.innerHTML = `<strong>Phone:</strong> ${currentUserProfile.phone || 'N/A'}`;
                    userEmailSpan.parentElement.insertBefore(userPhoneP, userEmailSpan.nextElementSibling); // Insert after email
                }
            }


            // Fetch and display booking history
            if (bookingListDiv) {
                fetchBookingHistory(user.email, bookingsMessage, bookingListDiv);
            }

            // Logout button listener
            if (logoutButton) {
                logoutButton.addEventListener('click', async () => {
                    try {
                        await signOut(auth);
                        console.log("User logged out.");
                        // Redirect to login page or home after logout
                        window.location.href = 'login.html';
                    } catch (error) {
                        console.error("Error logging out:", error);
                        showMessage('Error logging out. Please try again.', true);
                    }
                });
            }
        } else {
            // User is not logged in, redirect to login page
            console.log("No user signed in on profile page, redirecting to login.");
            window.location.href = 'login.html';
        }
    }
});

// --- Fetch Booking History for Profile Page ---
async function fetchBookingHistory(userEmail, messageElement, listElement) {
    messageElement.textContent = "Loading your booking history...";
    listElement.innerHTML = ''; // Clear previous bookings

    try {
        const bookingsRef = collection(db, "bookings");
        // Query bookings for the current user's email
        const q = query(
            bookingsRef,
            where("email", "==", userEmail),
            orderBy("createdAt", "desc") // Order by most recent booking first
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            messageElement.textContent = "You have no past bookings.";
        } else {
            messageElement.textContent = ""; // Clear loading message
            querySnapshot.forEach((doc) => {
                const booking = doc.data();
                const bookingDate = booking.bookingDate ? booking.bookingDate.toDate().toLocaleString() : 'N/A'; // Convert Timestamp to readable string
                const createdAt = booking.createdAt ? booking.createdAt.toDate().toLocaleString() : 'N/A';

                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item';
                bookingItem.innerHTML = `
                    <p><strong>Class:</strong> ${booking.classTitle || 'N/A'}</p>
                    <p><strong>Instructor:</strong> ${booking.instructorId || 'N/A'}</p>
                    <p><strong>Date & Time:</strong> ${bookingDate} (${booking.classStartTime || ''} - ${booking.classEndTime || ''})</p>
                    <p><strong>Status:</strong> ${booking.status || 'N/A'}</p>
                    <p><em>Booked on: ${createdAt}</em></p>
                `;
                listElement.appendChild(bookingItem);
            });
        }
    } catch (error) {
        console.error("Error fetching booking history:", error);
        messageElement.textContent = "Error loading booking history. Please try again.";
        messageElement.classList.add('error'); // Add error styling
    }
}


// --- Signup Form Logic ---
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstName = document.getElementById('signup-firstName').value;
        const lastName = document.getElementById('signup-lastName').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        if (password !== confirmPassword) {
            showMessage('Passwords do not match!', true);
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "userProfiles", user.uid), {
                firstName: firstName,
                lastName: lastName,
                email: email,
                phone: phone,
                createdAt: new Date()
            });

            showMessage('Account created successfully! Redirecting to profile...', false);
            setTimeout(() => {
                window.location.href = 'profile.html'; // Always redirect to profile after signup
            }, 1500);
        } catch (error) {
            console.error("Signup failed:", error);
            let errorMessage = "Signup failed. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'This email is already in use. Try logging in.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password should be at least 6 characters.';
            }
            showMessage(errorMessage, true);
        }
    });
}

// --- Login Form Logic ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // NEW: Check if the logged-in user is an admin
            const isAdminUser = await checkIfAdmin(user.uid);

            showMessage('Logged in successfully! Redirecting...', false);
            setTimeout(() => {
                if (isAdminUser) {
                    window.location.href = 'admin.html'; // Redirect admin to admin panel
                } else {
                    window.location.href = 'profile.html'; // Redirect regular user to profile
                }
            }, 1500);
        } catch (error) {
            console.error("Login failed:", error);
            let errorMessage = "Login failed. Please check your email and password.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                errorMessage = 'Invalid credentials. Please try again.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            }
            showMessage(errorMessage, true);
        }
    });
}
