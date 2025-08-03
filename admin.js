// admin.js

// Import Firebase services
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    doc, getDoc,
    collection, addDoc, updateDoc, deleteDoc, getDocs,
    query, orderBy, where, Timestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { userProfileReadyPromise } from './auth.js';

// Get main DOM elements (these are static in admin.html)
const adminContentDiv = document.getElementById('admin-content');
let adminSectionContentDiv; // This will be set after renderAdminDashboard

// Map to store all instructor data (id -> name) for admin panel use
const allInstructorsMap = new Map();

// --- Helper function to display messages within a specific container ---
function showAdminMessage(message, isError = false, targetElementId = 'admin-general-message') {
    let messageDiv = document.getElementById(targetElementId);

    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.id = targetElementId;
        messageDiv.className = 'message-container';
        
        if (targetElementId === 'admin-general-message' && adminContentDiv) {
            adminContentDiv.prepend(messageDiv);
        } else if (adminSectionContentDiv) {
            const currentActiveSection = adminSectionContentDiv.querySelector('div[id$="-content"]');
            if (currentActiveSection) {
                currentActiveSection.prepend(messageDiv);
            } else {
                adminSectionContentDiv.prepend(messageDiv);
            }
        } else {
            console.warn("Could not find or create message container for:", targetElementId);
            return;
        }
    }

    if (messageDiv.timeoutId) {
        clearTimeout(messageDiv.timeoutId);
    }

    messageDiv.textContent = message;
    messageDiv.className = 'message-container';
    if (isError) {
        messageDiv.classList.add('error');
    } else {
        messageDiv.classList.add('success');
    }
    messageDiv.style.opacity = '1';
    messageDiv.style.display = 'block';

    messageDiv.timeoutId = setTimeout(() => {
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            messageDiv.style.display = 'none';
            messageDiv.textContent = '';
            messageDiv.className = 'message-container';
        }, 300);
    }, 5000);
}

// --- Function to fetch ALL instructors (for admin panel use) ---
async function fetchAllInstructors() {
    try {
        const instructorsRef = collection(db, "instructors");
        const q = query(instructorsRef, orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);

        allInstructorsMap.clear();
        querySnapshot.forEach((doc) => {
            const instructorData = doc.data();
            allInstructorsMap.set(doc.id, instructorData.name);
        });
        console.log("All instructors fetched and mapped for admin:", allInstructorsMap);
    } catch (error) {
        console.error("Error fetching all instructors for admin:", error);
        showAdminMessage("Error loading instructor list.", true, 'admin-general-message');
    }
}


// --- Function to render the admin dashboard (main overview) ---
function renderAdminDashboard(user) {
    if (!adminContentDiv) return;

    adminContentDiv.innerHTML = `
        <h2 class="section-title">Welcome, Admin!</h2>
        <p>You are logged in as: <strong>${user.email}</strong></p>
        <div class="admin-dashboard-overview">
            <div class="overview-card">
                <h3>Total Classes</h3>
                <p id="total-classes">Loading...</p>
            </div>
            <div class="overview-card">
                <h3>Upcoming Bookings</h3>
                <p id="upcoming-bookings">Loading...</p>
            </div>
            <div class="overview-card">
                <h3>Registered Users</h3>
                <p id="registered-users">Loading...</p>
            </div>
        </div>

        <div class="admin-actions">
            <button id="manage-classes-btn" class="button primary-button">Manage Classes</button>
            <button id="view-bookings-btn" class="button secondary-button">View All Bookings</button>
            <button id="manage-instructors-btn" class="button secondary-button">Manage Instructors</button>
            <button id="admin-logout-btn" class="button secondary-button">Logout</button>
        </div>

        <div id="admin-section-content" style="margin-top: 50px;">
            <p style="text-align: center; color: var(--color-text-dark);">Select an action above to get started.</p>
        </div>
    `;

    adminSectionContentDiv = document.getElementById('admin-section-content');

    document.getElementById('admin-logout-btn').addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("Admin logged out.");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Error logging out admin:", error);
            showAdminMessage('Error logging out. Please try again.', true);
        }
    });

    document.getElementById('manage-classes-btn').addEventListener('click', () => {
        renderClassManagementSection();
    });

    document.getElementById('view-bookings-btn').addEventListener('click', () => {
        renderBookingManagementSection();
    });

    document.getElementById('manage-instructors-btn').addEventListener('click', () => {
        renderInstructorManagementSection();
    });

    fetchOverviewData();
}

// --- Function to fetch and display overview data (e.g., counts) ---
async function fetchOverviewData() {
    try {
        const classesSnapshot = await getDocs(collection(db, "classes"));
        document.getElementById('total-classes').textContent = classesSnapshot.size;

        const bookingsSnapshot = await getDocs(query(collection(db, "bookings"), where("status", "in", ["Pending", "Confirmed"])));
        document.getElementById('upcoming-bookings').textContent = bookingsSnapshot.size;

        const usersSnapshot = await getDocs(collection(db, "userProfiles"));
        document.getElementById('registered-users').textContent = usersSnapshot.size;

    } catch (error) {
        console.error("Error fetching overview data:", error);
    }
}


// --- Class Management Functions (Dynamically Rendered) ---

async function renderClassManagementSection() {
    if (!adminSectionContentDiv) return;

    await fetchAllInstructors();

    adminSectionContentDiv.innerHTML = `
        <div id="class-management-content">
            <h2 class="section-title">Manage Classes</h2>

            <div class="admin-form-card">
                <h3><span id="class-form-title">Add New Class</span></h3>
                <form id="class-form">
                    <input type="hidden" id="class-id-input">

                    <div class="form-group">
                        <label for="classTitle">Class Title</label>
                        <input type="text" id="classTitle" required>
                    </div>
                    <div class="form-group">
                        <label for="classInstructor">Instructor</label>
                        <select id="classInstructor" required>
                            <option value="">Select an Instructor</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="classDate">Date</label>
                        <input type="date" id="classDate" required>
                    </div>
                    <div class="form-group">
                        <label for="classStartTime">Start Time</label>
                        <input type="time" id="classStartTime" required>
                    </div>
                    <div class="form-group">
                        <label for="classEndTime">End Time</label>
                        <input type="time" id="classEndTime" required>
                    </div>
                    <div class="form-group">
                        <label for="classCapacity">Capacity</label>
                        <input type="number" id="classCapacity" min="1" value="10" required>
                    </div>
                    <div class="form-group checkbox-group">
                        <input type="checkbox" id="classIsActive">
                        <label for="classIsActive">Active (Show on Schedule)</label>
                    </div>
                    <div class="form-submit">
                        <button type="submit" class="button primary-button"><span id="class-submit-button-text">Add Class</span></button>
                        <button type="button" id="cancel-edit-btn" class="button secondary-button" style="display: none; margin-left: 10px;">Cancel Edit</button>
                    </div>
                    <div id="class-message" class="message-container"></div>
                </form>
            </div>

            <div class="admin-table-card">
                <h3>Existing Classes</h3>
                <div class="admin-table-container">
                    <table id="classes-table" class="admin-table">
                        <thead>
                            <tr>
                                <th>Title</th>
                                <th>Instructor</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Capacity</th>
                                <th>Booked</th>
                                <th>Active</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="8" style="text-align: center;">Loading classes...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const classForm = document.getElementById('class-form');
    const classIdInput = document.getElementById('class-id-input');
    const classTitleInput = document.getElementById('classTitle');
    const classInstructorSelect = document.getElementById('classInstructor');
    const classDateInput = document.getElementById('classDate');
    const classStartTimeInput = document.getElementById('classStartTime');
    const classEndTimeInput = document.getElementById('classEndTime');
    const classCapacityInput = document.getElementById('classCapacity');
    const classIsActiveCheckbox = document.getElementById('classIsActive');
    const classFormTitle = document.getElementById('class-form-title');
    const classSubmitButtonText = document.getElementById('class-submit-button-text');
    const cancelEditButton = document.getElementById('cancel-edit-btn');
    const classMessageContainer = document.getElementById('class-message');
    const classesTableBody = document.querySelector('#classes-table tbody');

    populateClassInstructorDropdown(classInstructorSelect);


    async function fetchAndRenderClasses() {
        classesTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Loading classes...</td></tr>';
        try {
            const classesRef = collection(db, "classes");
            const q = query(classesRef, orderBy("date", "asc"), orderBy("startTime", "asc"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                classesTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No classes found.</td></tr>';
                return;
            }

            classesTableBody.innerHTML = '';

            querySnapshot.forEach((doc) => {
                const classData = doc.data();
                const classId = doc.id;
                const classDate = classData.date.toDate().toLocaleDateString();
                const isActive = classData.isActive ? 'Yes' : 'No';
                const instructorName = allInstructorsMap.get(classData.instructorId) || classData.instructorId;


                const row = classesTableBody.insertRow();
                row.insertCell(0).textContent = classData.title;
                row.insertCell(1).textContent = instructorName;
                row.insertCell(2).textContent = classDate;
                row.insertCell(3).textContent = `${classData.startTime} - ${classData.endTime}`;
                row.insertCell(4).textContent = classData.capacity;
                row.insertCell(5).textContent = classData.bookedSlots;
                row.insertCell(6).textContent = isActive;

                const actionsCell = row.insertCell(7);
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.className = 'button secondary-button small-button';
                editBtn.addEventListener('click', () => editClass(classId, classData));

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'button primary-button small-button delete-button';
                deleteBtn.addEventListener('click', () => deleteClass(classId));

                actionsCell.appendChild(editBtn);
                actionsCell.appendChild(deleteBtn);
            });

        } catch (error) {
            console.error("Error fetching and rendering classes:", error);
            classesTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading classes.</td></tr>';
            showAdminMessage("Error loading classes.", true, 'class-message');
        }
    }

    if (classForm) {
        classForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = classIdInput.value;
            const title = classTitleInput.value;
            const instructorId = classInstructorSelect.value; 
            const date = Timestamp.fromDate(new Date(classDateInput.value));
            const startTime = classStartTimeInput.value;
            const endTime = classEndTimeInput.value;
            const capacity = parseInt(classCapacityInput.value, 10);
            const isActive = classIsActiveCheckbox.checked;

            if (isNaN(capacity) || capacity <= 0) {
                showAdminMessage('Capacity must be a positive number.', true, 'class-message');
                return;
            }
            if (!instructorId) {
                showAdminMessage('Please select an instructor.', true, 'class-message');
                return;
            }


            try {
                if (id) {
                    const classDocRef = doc(db, "classes", id);
                    await updateDoc(classDocRef, {
                        title: title,
                        instructorId: instructorId,
                        date: date,
                        startTime: startTime,
                        endTime: endTime,
                        capacity: capacity,
                        isActive: isActive
                    });
                    showAdminMessage('Class updated successfully!', false, 'class-message');
                } else {
                    await addDoc(collection(db, "classes"), {
                        title: title,
                        instructorId: instructorId,
                        date: date,
                        startTime: startTime,
                        endTime: endTime,
                        capacity: capacity,
                        bookedSlots: 0,
                        isActive: isActive,
                        createdAt: Timestamp.now()
                    });
                    showAdminMessage('Class added successfully!', false, 'class-message');
                }

                classForm.reset();
                cancelEditButton.style.display = 'none';
                classFormTitle.textContent = 'Add New Class';
                classSubmitButtonText.textContent = 'Add Class';
                fetchAndRenderClasses();
                fetchOverviewData();
            } catch (error) {
                console.error("Error saving class:", error);
                showAdminMessage(`Error saving class: ${error.message}`, true, 'class-message');
            }
        });
    }

    function editClass(classId, classData) {
        classIdInput.value = classId;
        classTitleInput.value = classData.title;
        classInstructorSelect.value = classData.instructorId; 
        classDateInput.value = classData.date.toDate().toISOString().split('T')[0];
        classStartTimeInput.value = classData.startTime;
        classEndTimeInput.value = classData.endTime;
        classCapacityInput.value = classData.capacity;
        classIsActiveCheckbox.checked = classData.isActive;

        classFormTitle.textContent = 'Edit Class';
        classSubmitButtonText.textContent = 'Update Class';
        cancelEditButton.style.display = 'inline-block';

        classForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (cancelEditButton) {
        cancelEditButton.addEventListener('click', () => {
            classForm.reset();
            classIdInput.value = '';
            classFormTitle.textContent = 'Add New Class';
            classSubmitButtonText.textContent = 'Add Class';
            cancelEditButton.style.display = 'none';
            showAdminMessage('Edit cancelled.', false, 'class-message');
        });
    }

    async function deleteClass(classId) {
        if (confirm('Are you sure you want to delete this class? This action cannot be undone.')) {
            try {
                await deleteDoc(doc(db, "classes", classId));
                showAdminMessage('Class deleted successfully!', false, 'class-message');
                fetchAndRenderClasses();
                fetchOverviewData();
            } catch (error) {
                console.error("Error deleting class:", error);
                showAdminMessage(`Error deleting class: ${error.message}`, true, 'class-message');
            }
        }
    }

    function populateClassInstructorDropdown(selectElement) {
        selectElement.innerHTML = '<option value="">Select an Instructor</option>';
        allInstructorsMap.forEach((name, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            selectElement.appendChild(option);
        });
    }

    fetchAndRenderClasses();
}


// --- Booking Management Functions (Dynamically Rendered) ---

function renderBookingManagementSection() {
    if (!adminSectionContentDiv) return;

    adminSectionContentDiv.innerHTML = `
        <div id="booking-management-content">
            <h2 class="section-title">Manage Bookings</h2>
            <div class="admin-table-card">
                <h3>All Client Bookings</h3>
                <div class="admin-table-container">
                    <table id="bookings-table" class="admin-table">
                        <thead>
                            <tr>
                                <th>Client Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Class</th>
                                <th>Date & Time</th>
                                <th>Status</th>
                                <th>Booked On</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="8" style="text-align: center;">Loading bookings...</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="booking-message" class="message-container"></div>
            </div>
        </div>
    `;

    const bookingsTableBody = document.querySelector('#bookings-table tbody');

    async function fetchAndRenderBookings() {
        bookingsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Loading bookings...</td></tr>';
        try {
            if (allInstructorsMap.size === 0) {
                await fetchAllInstructors();
            }

            const bookingsRef = collection(db, "bookings");
            const q = query(bookingsRef, orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                bookingsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No bookings found.</td></tr>';
                return;
            }

            bookingsTableBody.innerHTML = '';

            querySnapshot.forEach((doc) => {
                const bookingData = doc.data();
                const bookingId = doc.id;

                const bookingDate = bookingData.bookingDate ? bookingData.bookingDate.toDate().toLocaleDateString() : 'N/A';
                const bookedOn = bookingData.createdAt ? bookingData.createdAt.toDate().toLocaleString() : 'N/A';
                const instructorName = allInstructorsMap.get(bookingData.instructorId) || bookingData.instructorId;


                const row = bookingsTableBody.insertRow();
                row.insertCell(0).textContent = `${bookingData.firstName || ''} ${bookingData.lastName || ''}`;
                row.insertCell(1).textContent = bookingData.email || 'N/A';
                row.insertCell(2).textContent = bookingData.phone || 'N/A';
                row.insertCell(3).textContent = `${bookingData.classTitle || 'N/A'} (${instructorName})`;
                row.insertCell(4).textContent = `${bookingDate} (${bookingData.classStartTime || ''} - ${bookingData.classEndTime || ''})`;
                row.insertCell(5).textContent = bookingData.status || 'N/A';
                row.insertCell(6).textContent = bookedOn;

                const actionsCell = row.insertCell(7);
                
                // Confirm Button
                if (bookingData.status === 'Pending') {
                    const confirmBtn = document.createElement('button');
                    confirmBtn.textContent = 'Confirm';
                    confirmBtn.className = 'button secondary-button small-button';
                    confirmBtn.style.marginRight = '5px';
                    confirmBtn.addEventListener('click', () => updateBookingStatus(bookingId, 'Confirmed'));
                    actionsCell.appendChild(confirmBtn);
                }

                // Cancel Button (for Pending or Confirmed bookings)
                if (bookingData.status === 'Pending' || bookingData.status === 'Confirmed') {
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.className = 'button primary-button small-button delete-button';
                    cancelBtn.style.marginRight = '5px';
                    cancelBtn.addEventListener('click', () => updateBookingStatus(bookingId, 'Cancelled', bookingData.classId));
                    actionsCell.appendChild(cancelBtn);
                }

                // Delete Button (always available for admin)
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'button primary-button small-button delete-button';
                deleteBtn.addEventListener('click', () => deleteBooking(bookingId, bookingData.classId));
                actionsCell.appendChild(deleteBtn);
            });

        } catch (error) {
            console.error("Error fetching and rendering bookings:", error);
            bookingsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: red;">Error loading bookings.</td></tr>';
            showAdminMessage("Error loading bookings.", true, 'booking-message');
        }
    }

    // NEW: Function to update booking status - FIXED TRANSACTION LOGIC
    async function updateBookingStatus(bookingId, newStatus, classId = null) {
        try {
            await runTransaction(db, async (transaction) => {
                const bookingDocRef = doc(db, "bookings", bookingId);
                const classDocRef = classId ? doc(db, "classes", classId) : null;

                // --- ALL READS FIRST ---
                const bookingDocSnap = await transaction.get(bookingDocRef);
                let classDocSnap = null;
                if (classDocRef) {
                    classDocSnap = await transaction.get(classDocRef);
                }

                if (!bookingDocSnap.exists()) {
                    throw new Error("Booking not found.");
                }

                const currentBookingData = bookingDocSnap.data();
                const oldStatus = currentBookingData.status;
                
                // --- THEN ALL WRITES ---
                // Update booking status
                transaction.update(bookingDocRef, { status: newStatus });

                // If status changes from Confirmed/Pending to Cancelled, decrement bookedSlots
                if ((oldStatus === 'Confirmed' || oldStatus === 'Pending') && newStatus === 'Cancelled' && classDocSnap && classDocSnap.exists()) {
                    const classData = classDocSnap.data();
                    const currentBookedSlots = classData.bookedSlots || 0;
                    if (currentBookedSlots > 0) {
                        transaction.update(classDocRef, { bookedSlots: currentBookedSlots - 1 });
                    }
                }
            });
            showAdminMessage(`Booking ${bookingId} status updated to ${newStatus}!`, false, 'booking-message');
            fetchAndRenderBookings(); // Refresh the table
            fetchOverviewData(); // Update overview counts
        } catch (error) {
            console.error(`Error updating booking ${bookingId} status to ${newStatus}:`, error);
            showAdminMessage(`Failed to update booking status: ${error.message}`, true, 'booking-message');
        }
    }

    // NEW: Function to delete a booking - FIXED TRANSACTION LOGIC
    async function deleteBooking(bookingId, classId = null) {
        if (confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
            try {
                await runTransaction(db, async (transaction) => {
                    const bookingDocRef = doc(db, "bookings", bookingId);
                    const classDocRef = classId ? doc(db, "classes", classId) : null;

                    // --- ALL READS FIRST ---
                    const bookingDocSnap = await transaction.get(bookingDocRef);
                    let classDocSnap = null;
                    if (classDocRef) {
                        classDocSnap = await transaction.get(classDocRef);
                    }

                    if (!bookingDocSnap.exists()) {
                        throw new Error("Booking not found.");
                    }

                    const currentBookingData = bookingDocSnap.data();
                    const currentStatus = currentBookingData.status;

                    // --- THEN ALL WRITES ---
                    // Delete the booking document
                    transaction.delete(bookingDocRef);

                    // If the booking was Confirmed or Pending, decrement bookedSlots
                    if ((currentStatus === 'Confirmed' || currentStatus === 'Pending') && classDocSnap && classDocSnap.exists()) {
                        const classData = classDocSnap.data();
                        const currentBookedSlots = classData.bookedSlots || 0;
                        if (currentBookedSlots > 0) {
                            transaction.update(classDocRef, { bookedSlots: currentBookedSlots - 1 });
                        }
                    }
                });
                showAdminMessage('Booking deleted successfully!', false, 'booking-message');
                fetchAndRenderBookings(); // Refresh the table
                fetchOverviewData(); // Update overview counts
            } catch (error) {
                console.error("Error deleting booking:", error);
                showAdminMessage(`Failed to delete booking: ${error.message}`, true, 'booking-message');
            }
        }
    }

    fetchAndRenderBookings();
}


// --- Instructor Management Functions (Dynamically Rendered) ---

function renderInstructorManagementSection() {
    if (!adminSectionContentDiv) return;

    adminSectionContentDiv.innerHTML = `
        <div id="instructor-management-content">
            <h2 class="section-title">Manage Instructors</h2>

            <div class="admin-form-card">
                <h3><span id="instructor-form-title">Add New Instructor</span></h3>
                <form id="instructor-form">
                    <input type="hidden" id="instructor-id-input">

                    <div class="form-group">
                        <label for="instructorName">Instructor Name</label>
                        <input type="text" id="instructorName" required>
                    </div>
                    <div class="form-group">
                        <label for="instructorBio">Bio (Optional)</label>
                        <textarea id="instructorBio" rows="3"></textarea>
                    </div>
                    <div class="form-group checkbox-group">
                        <input type="checkbox" id="instructorIsActive">
                        <label for="instructorIsActive">Active (Show on Public Pages)</label>
                    </div>
                    <div class="form-submit">
                        <button type="submit" class="button primary-button"><span id="instructor-submit-button-text">Add Instructor</span></button>
                        <button type="button" id="cancel-instructor-edit-btn" class="button secondary-button" style="display: none; margin-left: 10px;">Cancel Edit</button>
                    </div>
                    <div id="instructor-message" class="message-container"></div>
                </form>
            </div>

            <div class="admin-table-card">
                <h3>Existing Instructors</h3>
                <div class="admin-table-container">
                    <table id="instructors-table" class="admin-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Bio</th>
                                <th>Active</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colspan="4" style="text-align: center;">Loading instructors...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const instructorForm = document.getElementById('instructor-form');
    const instructorIdInput = document.getElementById('instructor-id-input');
    const instructorNameInput = document.getElementById('instructorName');
    const instructorBioTextarea = document.getElementById('instructorBio');
    const instructorIsActiveCheckbox = document.getElementById('instructorIsActive');
    const instructorFormTitle = document.getElementById('instructor-form-title');
    const instructorSubmitButtonText = document.getElementById('instructor-submit-button-text');
    const cancelInstructorEditButton = document.getElementById('cancel-instructor-edit-btn');
    const instructorMessageContainer = document.getElementById('instructor-message');
    const instructorsTableBody = document.querySelector('#instructors-table tbody');


    async function fetchAndRenderInstructors() {
        instructorsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading instructors...</td></tr>';
        try {
            const instructorsRef = collection(db, "instructors");
            const q = query(instructorsRef, orderBy("name", "asc"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                instructorsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No instructors found.</td></tr>';
                return;
            }

            instructorsTableBody.innerHTML = '';

            querySnapshot.forEach((doc) => {
                const instructorData = doc.data();
                const instructorId = doc.id;
                const isActive = instructorData.isActive ? 'Yes' : 'No';

                const row = instructorsTableBody.insertRow();
                row.insertCell(0).textContent = instructorData.name;
                row.insertCell(1).textContent = instructorData.bio || 'N/A';
                row.insertCell(2).textContent = isActive;

                const actionsCell = row.insertCell(3);
                const editBtn = document.createElement('button');
                editBtn.textContent = 'Edit';
                editBtn.className = 'button secondary-button small-button';
                editBtn.addEventListener('click', () => editInstructor(instructorId, instructorData));

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'button primary-button small-button delete-button';
                deleteBtn.addEventListener('click', () => deleteInstructor(instructorId));

                actionsCell.appendChild(editBtn);
                actionsCell.appendChild(deleteBtn);
            });

        } catch (error) {
            console.error("Error fetching and rendering instructors:", error);
            instructorsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Error loading instructors.</td></tr>';
            showAdminMessage("Error loading instructors.", true, 'instructor-message');
        }
    }

    if (instructorForm) {
        instructorForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = instructorIdInput.value;
            const name = instructorNameInput.value;
            const bio = instructorBioTextarea.value;
            const isActive = instructorIsActiveCheckbox.checked;

            try {
                if (id) {
                    const instructorDocRef = doc(db, "instructors", id);
                    await updateDoc(instructorDocRef, {
                        name: name,
                        bio: bio,
                        isActive: isActive
                    });
                    showAdminMessage('Instructor updated successfully!', false, 'instructor-message');
                } else {
                    await addDoc(collection(db, "instructors"), {
                        name: name,
                        bio: bio,
                        isActive: isActive,
                        createdAt: Timestamp.now()
                    });
                    showAdminMessage('Instructor added successfully!', false, 'instructor-message');
                }

                instructorForm.reset();
                cancelInstructorEditButton.style.display = 'none';
                instructorFormTitle.textContent = 'Add New Instructor';
                instructorSubmitButtonText.textContent = 'Add Instructor';
                fetchAndRenderInstructors();
                fetchOverviewData();
            } catch (error) {
                console.error("Error saving instructor:", error);
                showAdminMessage(`Error saving instructor: ${error.message}`, true, 'instructor-message');
            }
        });
    }

    function editInstructor(instructorId, instructorData) {
        instructorIdInput.value = instructorId;
        instructorNameInput.value = instructorData.name;
        instructorBioTextarea.value = instructorData.bio || '';
        instructorIsActiveCheckbox.checked = instructorData.isActive;

        instructorFormTitle.textContent = 'Edit Instructor';
        instructorSubmitButtonText.textContent = 'Update Instructor';
        cancelInstructorEditButton.style.display = 'inline-block';

        instructorForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (cancelInstructorEditButton) {
        cancelInstructorEditButton.addEventListener('click', () => {
            instructorForm.reset();
            instructorIdInput.value = '';
            instructorFormTitle.textContent = 'Add New Instructor';
            instructorSubmitButtonText.textContent = 'Add Instructor';
            cancelInstructorEditButton.style.display = 'none';
            showAdminMessage('Edit cancelled.', false, 'instructor-message');
        });
    }

    async function deleteInstructor(instructorId) {
        if (confirm('Are you sure you want to delete this instructor? This action cannot be undone.')) {
            try {
                await deleteDoc(doc(db, "instructors", instructorId));
                showAdminMessage('Instructor deleted successfully!', false, 'instructor-message');
                fetchAndRenderInstructors();
                fetchOverviewData();
            } catch (error) {
                console.error("Error deleting instructor:", error);
                showAdminMessage(`Error deleting instructor: ${error.message}`, true, 'instructor-message');
            }
        }
    }

    fetchAndRenderInstructors();
}


// --- Main Admin Authentication Check ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await userProfileReadyPromise;

        try {
            const adminDocRef = doc(db, "adminRoles", user.uid);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists() && adminDocSnap.data().isAdmin === true) {
                console.log("Admin user logged in:", user.email);
                await fetchAllInstructors(); 
                renderAdminDashboard(user);
            } else {
                console.warn("User is logged in but not an admin. Redirecting.");
                showAdminMessage("Access Denied: You do not have administrator privileges.", true);
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            }
        } catch (error) {
            console.error("Error checking admin role:", error);
            showAdminMessage("Error verifying admin access. Please try again.", true);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    } else {
        console.log("No user logged in. Redirecting to login page.");
        showAdminMessage("Please log in to access the Admin Panel.", false);
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }
});
