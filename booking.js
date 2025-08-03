// booking.js
import { collection, addDoc, doc, getDoc, updateDoc, query, where, getDocs, runTransaction, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from './firebase-init.js';
import { currentUserProfile, userProfileReadyPromise } from './auth.js';


// Get form elements
const bookingForm = document.querySelector('.booking-form');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const preferredInstructorSelect = document.getElementById('preferredInstructor');
const availableClassSelect = document.getElementById('availableClass'); // New dropdown
const notesTextarea = document.getElementById('notes');
const agreePolicy1Checkbox = document.getElementById('agreePolicy1');
const agreePolicy2Checkbox = document.getElementById('agreePolicy2');
const agreePolicy3Checkbox = document.getElementById('agreePolicy3');

const formSubmitDiv = bookingForm.querySelector('.form-submit');

// Message display element and its timeout ID
let messageContainer;
let messageTimeoutId;

// Variable to store fetched class data (indexed by classId for easy lookup)
const availableClassesMap = new Map();
// NEW: Map to store instructor data (id -> name)
const instructorsMap = new Map();


// --- Helper function to display messages ---
function showMessage(message, isError = false) {
    if (messageTimeoutId) {
        clearTimeout(messageTimeoutId);
    }

    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        if (formSubmitDiv) {
            formSubmitDiv.appendChild(messageContainer);
        } else {
            bookingForm.prepend(messageContainer);
            console.warn("formSubmitDiv not found, prepending message to bookingForm as fallback.");
        }
    }
    
    messageContainer.textContent = message;
    messageContainer.style.color = isError ? 'var(--color-brown)' : 'green';
    messageContainer.style.backgroundColor = isError ? 'rgba(111, 79, 40, 0.1)' : 'rgba(0, 128, 0, 0.1)';
    messageContainer.style.padding = '15px';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.marginTop = '20px';
    messageContainer.style.marginBottom = '0';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.fontWeight = '600';
    messageContainer.style.border = isError ? '1px solid var(--color-brown)' : '1px solid green';
    messageContainer.style.opacity = '1';
    messageContainer.style.transition = 'opacity 0.3s ease';
    messageContainer.style.display = 'block';

    messageTimeoutId = setTimeout(() => {
        messageContainer.style.opacity = '0';
        setTimeout(() => {
            messageContainer.style.display = 'none';
            messageContainer.textContent = '';
            messageContainer.className = 'message-container';
        }, 300);
        messageTimeoutId = null;
    }, 5000);
}

// --- Helper function to get the start and end of the CURRENT week (Monday to Sunday) ---
function getWeekBounds() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayOfWeek = today.getDay(); // Sunday is 0, Monday is 1, ..., Saturday is 6

    let currentMonday = new Date(today);
    if (dayOfWeek === 0) {
        currentMonday.setDate(today.getDate() - 6);
    } else {
        currentMonday.setDate(today.getDate() - (dayOfWeek - 1));
    }

    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    currentSunday.setHours(23, 59, 59, 999);

    return {
        startOfWeek: Timestamp.fromDate(currentMonday),
        endOfWeek: Timestamp.fromDate(currentSunday)
    };
}

// --- NEW: Function to fetch and populate the instructor dropdown ---
async function populateInstructorsDropdown() {
    preferredInstructorSelect.innerHTML = '<option value="">Loading instructors...</option>';
    try {
        const instructorsRef = collection(db, "instructors");
        // Only fetch active instructors for public display
        const q = query(instructorsRef, where("isActive", "==", true), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            preferredInstructorSelect.innerHTML = '<option value="">No instructors available</option>';
            preferredInstructorSelect.disabled = true;
            return;
        }

        preferredInstructorSelect.innerHTML = '<option value="">Select an instructor</option>';
        preferredInstructorSelect.innerHTML += '<option value="any">Any Instructor</option>'; // Option for any instructor

        querySnapshot.forEach((doc) => {
            const instructorData = doc.data();
            // Store instructor ID and name in the map for later lookup
            instructorsMap.set(doc.id, instructorData.name); 
            const option = document.createElement('option');
            option.value = doc.id; // Use document ID as the value
            option.textContent = instructorData.name;
            preferredInstructorSelect.appendChild(option);
        });
        preferredInstructorSelect.disabled = false;

    } catch (error) {
        console.error("Error populating instructors dropdown:", error);
        preferredInstructorSelect.innerHTML = '<option value="">Error loading instructors</option>';
        preferredInstructorSelect.disabled = true;
        showMessage('Error loading instructors. Please try again.', true);
    }
}


// --- Function to fetch and populate available classes based on instructor ---
async function populateAvailableClasses(selectedInstructorId) {
    availableClassSelect.innerHTML = '<option value="">Loading classes...</option>';
    availableClassSelect.disabled = true;
    availableClassesMap.clear();

    try {
        const { startOfWeek, endOfWeek } = getWeekBounds();
        const classesRef = collection(db, "classes");

        let q;

        if (selectedInstructorId === 'any') {
            q = query(
                classesRef,
                where("date", ">=", startOfWeek),
                where("date", "<=", endOfWeek),
                where("isActive", "==", true),
                orderBy("date", "asc"),
                orderBy("startTime", "asc")
            );
        } else {
            q = query(
                classesRef,
                where("instructorId", "==", selectedInstructorId),
                where("date", ">=", startOfWeek),
                where("date", "<=", endOfWeek),
                where("isActive", "==", true),
                orderBy("date", "asc"),
                orderBy("startTime", "asc")
            );
        }

        const querySnapshot = await getDocs(q);
        const classes = [];

        querySnapshot.forEach((doc) => {
            const classData = doc.data();
            if (classData.bookedSlots < classData.capacity) {
                classes.push({ id: doc.id, ...classData });
                availableClassesMap.set(doc.id, { id: doc.id, ...classData });
            }
        });

        availableClassSelect.innerHTML = '';

        if (classes.length === 0) {
            availableClassSelect.innerHTML = '<option value="">No classes available</option>';
            availableClassSelect.disabled = true;
        } else {
            availableClassSelect.innerHTML = '<option value="">Select a class</option>';
            classes.forEach(classInfo => {
                const classDate = classInfo.date.toDate();
                const dayName = classDate.toLocaleString('en-US', { weekday: 'short' });
                const monthDay = classDate.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                const spotsLeft = classInfo.capacity - classInfo.bookedSlots;
                // NEW: Use instructor name from the instructorsMap
                const instructorName = instructorsMap.get(classInfo.instructorId) || classInfo.instructorId;

                const optionText = `${dayName} ${monthDay}, ${classInfo.startTime} (${instructorName}) - ${spotsLeft} spots`;
                const option = document.createElement('option');
                option.value = classInfo.id;
                option.textContent = optionText;
                availableClassSelect.appendChild(option);
            });
            availableClassSelect.disabled = false;
        }

    } catch (error) {
        console.error("Error populating available classes:", error);
        availableClassSelect.innerHTML = '<option value="">Error loading classes</option>';
        availableClassSelect.disabled = true;
        showMessage('Error loading available classes. Please try again.', true);
    }
}

// --- Function to disable/enable form fields ---
function setFormFieldsReadOnly(readOnly = true) {
    firstNameInput.readOnly = readOnly;
    lastNameInput.readOnly = readOnly;
    emailInput.readOnly = readOnly;
    phoneInput.readOnly = readOnly;
    preferredInstructorSelect.disabled = readOnly;
    availableClassSelect.disabled = readOnly;
    notesTextarea.readOnly = readOnly;
    agreePolicy1Checkbox.disabled = readOnly;
    agreePolicy2Checkbox.disabled = readOnly;
    agreePolicy3Checkbox.disabled = readOnly;
    bookingForm.querySelector('button[type="submit"]').disabled = readOnly;
}

// --- Initialize form based on URL parameters and user login status ---
document.addEventListener('DOMContentLoaded', async () => {
    // NEW: First populate the instructors dropdown
    await populateInstructorsDropdown();

    const urlParams = new URLSearchParams(window.location.search);
    const classIdFromUrl = urlParams.get('classId');
    const instructorIdFromUrl = urlParams.get('instructor');

    await userProfileReadyPromise;

    if (currentUserProfile) {
        firstNameInput.value = currentUserProfile.firstName || '';
        lastNameInput.value = currentUserProfile.lastName || '';
        emailInput.value = currentUserProfile.email || '';
        phoneInput.value = currentUserProfile.phone || '';

        firstNameInput.readOnly = true;
        lastNameInput.readOnly = true;
        emailInput.readOnly = true;
        phoneInput.readOnly = true;
    }

    if (classIdFromUrl) {
        try {
            const classDocRef = doc(db, "classes", classIdFromUrl);
            const classDocSnap = await getDoc(classDocRef);

            if (classDocSnap.exists()) {
                const classData = classDocSnap.data();
                const spotsLeft = classData.capacity - classData.bookedSlots;

                if (spotsLeft <= 0) {
                    showMessage('This class is fully booked. Please select another.', true);
                    setFormFieldsReadOnly(true);
                    return;
                }

                const instructorOptionValue = classData.instructorId;
                // NEW: Ensure the instructor is selected if it exists in the new dropdown
                if (instructorsMap.has(instructorOptionValue)) {
                    preferredInstructorSelect.value = instructorOptionValue;
                } else {
                    // Fallback if instructor not found (e.g., inactive or deleted)
                    preferredInstructorSelect.value = 'any'; 
                }
                
                availableClassSelect.innerHTML = '';
                const classDate = classData.date.toDate();
                const dayName = classDate.toLocaleString('en-US', { weekday: 'short' });
                const monthDay = classDate.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                // NEW: Use instructor name from the instructorsMap
                const instructorName = instructorsMap.get(classData.instructorId) || classData.instructorId;

                const optionText = `${dayName} ${monthDay}, ${classData.startTime} (${instructorName}) - ${spotsLeft} spots`;
                const option = document.createElement('option');
                option.value = classIdFromUrl;
                option.textContent = optionText;
                availableClassSelect.appendChild(option);
                availableClassSelect.value = classIdFromUrl;
                
                availableClassesMap.set(classIdFromUrl, { id: classIdFromUrl, ...classData });

                preferredInstructorSelect.disabled = true;
                availableClassSelect.disabled = true;

                showMessage(`You are booking: ${optionText}`, false);

            } else {
                showMessage('Error: Class not found. Please select from the schedule.', true);
                // NEW: Re-initialize instructor dropdown selection if class not found
                if (instructorIdFromUrl && instructorsMap.has(instructorIdFromUrl)) {
                    preferredInstructorSelect.value = instructorIdFromUrl;
                } else {
                    preferredInstructorSelect.value = 'any';
                }
                populateAvailableClasses(preferredInstructorSelect.value || 'any');
            }
        } catch (error) {
            console.error("Error fetching specific class:", error);
            showMessage('Error loading class details. Please try again or select manually.', true);
            // NEW: Re-initialize instructor dropdown selection on error
            if (instructorIdFromUrl && instructorsMap.has(instructorIdFromUrl)) {
                preferredInstructorSelect.value = instructorIdFromUrl;
            } else {
                preferredInstructorSelect.value = 'any';
            }
            populateAvailableClasses(preferredInstructorSelect.value || 'any');
        }
    } else {
        // User accessed booking page directly or via old instructor buttons
        // NEW: Ensure initial instructor selection is valid
        if (instructorIdFromUrl && instructorsMap.has(instructorIdFromUrl)) {
            preferredInstructorSelect.value = instructorIdFromUrl;
        } else {
            preferredInstructorSelect.value = 'any'; // Default to "Any Instructor"
        }
        populateAvailableClasses(preferredInstructorSelect.value || 'any');
    }
});

// --- Event Listener for Instructor Selection Change ---
preferredInstructorSelect.addEventListener('change', (e) => {
    const selectedInstructor = e.target.value;
    if (selectedInstructor) {
        populateAvailableClasses(selectedInstructor);
    } else {
        availableClassSelect.innerHTML = '<option value="">Select an instructor first</option>';
        availableClassSelect.disabled = true;
    }
});


// --- Function to handle form submission ---
bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!firstNameInput.value || !lastNameInput.value || !emailInput.value || !phoneInput.value ||
        !preferredInstructorSelect.value || !availableClassSelect.value) {
        showMessage('Please fill in all required fields and select a class.', true);
        return;
    }

    if (!agreePolicy1Checkbox.checked || !agreePolicy2Checkbox.checked || !agreePolicy3Checkbox.checked) {
        showMessage('You must agree to all terms of the cancellation policy to book.', true);
        return;
    }

    const selectedClassId = availableClassSelect.value;
    const selectedClassData = availableClassesMap.get(selectedClassId);

    if (!selectedClassData) {
        showMessage('Error: Selected class details not found. Please re-select a class.', true);
        return;
    }

    const bookingDetails = {
        firstName: firstNameInput.value,
        lastName: lastNameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        classType: selectedClassData.title,
        bookingDate: selectedClassData.date,
        preferredInstructor: selectedClassData.instructorId, // Store instructor ID
        notes: notesTextarea.value,
        status: 'Confirmed',
        createdAt: Timestamp.now()
    };

try {
    await runTransaction(db, async (transaction) => {
        const classDocRef = doc(db, "classes", selectedClassId);
        const classDocSnap = await transaction.get(classDocRef);

        if (!classDocSnap.exists()) {
            throw new Error("Class not found in database.");
        }

        const classData = classDocSnap.data(); // THIS IS WHERE classData IS DEFINED

        if (classData.bookedSlots >= classData.capacity) {
            throw new Error("This class is now fully booked. Please select another.");
        }

        // Update class slots
        const newBookedSlots = classData.bookedSlots + 1;
        transaction.update(classDocRef, { bookedSlots: newBookedSlots });

        // Create booking
        const newBookingRef = doc(collection(db, "bookings"));
        transaction.set(newBookingRef, {
            ...bookingDetails,
            classId: classDocRef.id,
            classTitle: classData.title,
            instructorId: classData.instructorId,
            classDate: classData.date,
            classStartTime: classData.startTime,
            classEndTime: classData.endTime
        });


        showMessage('Booking confirmed! Check your email for details.', false);
        bookingForm.reset();
        populateAvailableClasses(preferredInstructorSelect.value || 'any');
    });
} catch (error) {
    console.error("Booking failed:", error);
    showMessage(`Booking failed: ${error.message}`, true);
}
});

