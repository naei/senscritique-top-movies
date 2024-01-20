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

    Object.keys(moviesData).forEach((movieTitle, index) => {
        const movie = moviesData[movieTitle];
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
            label: movieTitle,
            data: data,
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
                    max: yAxisMax, // Set dynamically based on data
                }
            },
        }
    });
}

let chartCounter = 0; // Counter for generating unique chart IDs

function displayMovies(moviesData) {
    const container = document.getElementById('movies-container');
    const addedMovies = []; // Maintain a list of added movies

    Object.keys(moviesData).forEach((movieTitle, index) => {
        const movie = moviesData[movieTitle];

        // Check if the movie title is already in the addedMovies list
        if (!addedMovies.includes(movieTitle)) {
            const movieDiv = document.createElement('div');
            movieDiv.className = 'movie';

            // Generate a unique chart ID for the canvas
            const chartID = `chart-${chartCounter}`;
            chartCounter++; // Increment the counter

            movieDiv.innerHTML = `
                <div class="movie-info">
                    <img src="${movie.picture}" alt="${movieTitle}" class="movie-picture">
                    <span class="movie-title">#${index+1} - ${movieTitle}</span>
                </div>
                <div class="chart-container">
                    <canvas id="${chartID}" class="movie-chart"></canvas>
                </div>
            `;

            container.appendChild(movieDiv);

            const maxRank = Math.max(...movie.entries.map(entry => entry.rank));
            const yAxisMax = Math.ceil(maxRank / 10) * 10; // Round up to the nearest multiple of 10

            const ctx = document.getElementById(chartID).getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: movie.entries.map(entry => entry.date),
                    datasets: [{
                        label: movieTitle,
                        data: movie.entries.map(entry => entry.rank),
                    }]
                },
                options: {
                    scales: {
                        y: {
                            reverse: true,
                            min: 1,
                            max: yAxisMax,
                        }
                    },
                }
            });

            // Add the movie title to the addedMovies list to prevent duplicates
            addedMovies.push(movieTitle);

            // Debugging: Print the movie title as it's added
            console.log('Added movie:', movieTitle);
        }
    });
}
