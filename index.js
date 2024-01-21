document.addEventListener('DOMContentLoaded', function () {
    fetch('movies.json')
        .then(response => response.json())
        .then(data => {
            createAggregateChart(data);
            displayMovies(data);
        })
        .catch(error => console.error('Error:', error));
});

function createAggregateChart(moviesData) {
    const ctx = document.getElementById('aggregate-chart').getContext('2d');
    const datasets = [];
    const labels = new Set(); // To store unique dates
    let maxRank = 0; // To determine the highest rank

    Object.values(moviesData).forEach(movie => {
        movie.entries.forEach(entry => {
            labels.add(entry.date);
            if (entry.rank > maxRank) {
                maxRank = entry.rank; // Update maxRank if a higher rank is found
            }
        });

        const data = movie.entries.map(entry => ({
            x: entry.date,
            y: entry.rank
        }));

        datasets.push({
            label: movie.title, // Use movie title instead of ID
            data: data,
            fill: false,
        });
    });

    const yAxisMax = maxRank + 5; // Add a small buffer to the maximum rank

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from(labels).sort(),
            datasets: datasets
        },
        options: {
            scales: {
                y: {
                    reverse: true,
                    min: 1,
                    max: yAxisMax,
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'right', // Position the legend to the right
                    align: 'start', // Align to the top of the chart area
                    labels: {
                        boxWidth: 10,
                        padding: 10
                    }
                }
            }
        }
    });
}

let chartCounter = 0; // Counter for generating unique chart IDs

function displayMovies(moviesData) {
    const container = document.getElementById('movies-container');
    const allDates = new Set(); // Set to store all unique dates

    // Collect all unique dates from every movie
    Object.values(moviesData).forEach(movie => {
        movie.entries.forEach(entry => allDates.add(entry.date));
    });

    const sortedDates = Array.from(allDates).sort();

    // Sort movies based on their latest rank
    const moviesArray = Object.values(moviesData).sort((a, b) => {
        const aLatestEntry = a.entries[a.entries.length - 1];
        const bLatestEntry = b.entries[b.entries.length - 1];
        return aLatestEntry.rank - bLatestEntry.rank;
    });

    moviesArray.forEach((movie, index) => {
        const movieDiv = document.createElement('div');
        movieDiv.className = 'movie';

        // Generate a unique chart ID for the canvas
        const chartID = `chart-${chartCounter}`;
        chartCounter++; // Increment the counter

        movieDiv.innerHTML = `
            <div class="movie-info">
                <img src="${movie.picture}" alt="${movie.title}" class="movie-picture">
                <span class="movie-title">#${index+1} - ${movie.title}</span>
            </div>
            <div class="chart-container">
                <canvas id="${chartID}" class="movie-chart"></canvas>
            </div>
        `;

        container.appendChild(movieDiv);

        // Create a standardized dataset for the movie with all dates
        const standardizedData = sortedDates.map(date => {
            const entry = movie.entries.find(entry => entry.date === date);
            return {
                x: date,
                y: entry ? entry.rank : null // Use null or a specific value if no data for this date
            };
        });

        const ctx = document.getElementById(chartID).getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: movie.title,
                    data: standardizedData,
                    fill: false, // Optional: for better visual distinction
                }]
            },
            options: {
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        reverse: true,
                        min: 1,
                        suggestedMax: 10, // Adjust as needed
                    }
                }
            }
        });
    });
}
