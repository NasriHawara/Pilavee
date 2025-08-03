// JS/schedule.js

// Import Firestore database instance from our central Firebase initialization file
import { db } from './firebase-init.js';
import { collection, addDoc, doc, getDoc, updateDoc, query, where, getDocs, runTransaction, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

// DOM element for the schedule table container (the parent that holds the table)
const scheduleTableContainer = document.querySelector('.schedule-table-container');

// NEW: Map to store instructor data (id -> name)
const instructorsMap = new Map();

// --- Helper function to get the start and end of the CURRENT week (Monday to Sunday) ---
function getWeekBounds() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayOfWeek = today.getDay(); // Sunday is 0, Monday is 1, ..., Saturday is 6

    let currentMonday = new Date(today);
    if (dayOfWeek === 0) { // If today is Sunday
        currentMonday.setDate(today.getDate() - 6); // Go back 6 days to Monday
    } else { // If today is Monday-Saturday
        currentMonday.setDate(today.getDate() - (dayOfWeek - 1)); // Go back (dayOfWeek - 1) days to Monday
    }

    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    currentSunday.setHours(23, 59, 59, 999);

    return {
        startOfWeek: Timestamp.fromDate(currentMonday),
        endOfWeek: Timestamp.fromDate(currentSunday)
    };
}

// --- NEW: Function to fetch and store active instructors ---
async function fetchInstructors() {
    try {
        const instructorsRef = collection(db, "instructors");
        const q = query(instructorsRef, where("isActive", "==", true), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);

        instructorsMap.clear(); // Clear previous data
        querySnapshot.forEach((doc) => {
            const instructorData = doc.data();
            instructorsMap.set(doc.id, instructorData.name);
        });
        console.log("Instructors fetched and mapped:", instructorsMap);
    } catch (error) {
        console.error("Error fetching instructors:", error);
        // Don't block schedule display if instructors fail to load
    }
}

// --- Function to fetch classes from Firestore and display schedule ---
async function fetchAndDisplaySchedule() {
    if (!scheduleTableContainer) {
        console.error("Schedule table container not found.");
        return;
    }

    // Display a loading message
    scheduleTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">Loading class schedule...</p>';

    try {
        // NEW: First, fetch instructors
        await fetchInstructors();

        const { startOfWeek, endOfWeek } = getWeekBounds();
        console.log("Fetching classes for week:", startOfWeek.toDate(), "to", endOfWeek.toDate());

        const classesRef = collection(db, "classes");
        const q = query(
            classesRef,
            where("date", ">=", startOfWeek),
            where("date", "<=", endOfWeek),
            where("isActive", "==", true),
            orderBy("date", "asc"),
            orderBy("startTime", "asc")
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            scheduleTableContainer.innerHTML = '<p style="text-align: center; padding: 20px;">No classes scheduled for this week. Please check back soon!</p>';
            return;
        }

        const classesByDayAndTime = {
            "Monday": {}, "Tuesday": {}, "Wednesday": {}, "Thursday": {},
            "Friday": {}, "Saturday": {}, "Sunday": {}
        };
        const allTimes = new Set();

        querySnapshot.forEach((doc) => {
            const classData = doc.data();
            const classId = doc.id;
            const classDate = classData.date.toDate();
            const dayName = classDate.toLocaleString('en-US', { weekday: 'long' });
            const time = classData.startTime;

            if (!classesByDayAndTime[dayName]) {
                classesByDayAndTime[dayName] = {};
            }
            if (!classesByDayAndTime[dayName][time]) {
                classesByDayAndTime[dayName][time] = [];
            }
            classesByDayAndTime[dayName][time].push({ ...classData, id: classId });
            allTimes.add(time);
        });

        const sortedTimes = Array.from(allTimes).sort();

        const tableHtml = `
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Monday</th>
                        <th>Tuesday</th>
                        <th>Wednesday</th>
                        <th>Thursday</th>
                        <th>Friday</th>
                        <th>Saturday</th>
                        <th>Sunday</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTimes.map(time => {
                        const rowCells = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => {
                            const classesAtTime = classesByDayAndTime[day][time] || [];
                            if (classesAtTime.length > 0) {
                                const classInfo = classesAtTime[0];
                                const spotsLeft = classInfo.capacity - classInfo.bookedSlots;
                                const linkUrl = `booking.html?classId=${classInfo.id}&instructor=${classInfo.instructorId}`;
                                // NEW: Get instructor name from the map
                                const instructorName = instructorsMap.get(classInfo.instructorId) || classInfo.instructorId; // Fallback to ID if name not found
                                return `
                                    <td>
                                        <a href="${linkUrl}" class="class-slot-link">
                                            ${classInfo.title}<br>
                                            <span class="instructor-name">(${instructorName})</span><br>
                                            <span class="spots-left">(${spotsLeft} spots)</span>
                                        </a>
                                    </td>
                                `;
                            }
                            return `<td></td>`;
                        }).join('');
                        return `
                            <tr>
                                <td>${time}</td>
                                ${rowCells}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        scheduleTableContainer.innerHTML = tableHtml;
        
    } catch (error) {
        console.error("Error fetching or rendering schedule:", error);
        scheduleTableContainer.innerHTML = '<p style="text-align: center; padding: 20px; color: red;">Error loading schedule. Please try again later.</p>';
    }
}

// --- Initial call to fetch and display schedule when the page loads ---
document.addEventListener('DOMContentLoaded', fetchAndDisplaySchedule);
