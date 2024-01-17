document.addEventListener('DOMContentLoaded', function () {
    fetch('movies.json')
        .then(response => response.json())
        .then(data => {
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
        const movieEntries = moviesData[movieTitle];
        movieEntries.forEach(entry => {
            labels.add(entry.date);
            if (entry.rank > maxRank) {
                maxRank = entry.rank; // Update maxRank if a higher rank is found
            }
        });

        const data = movieEntries.map(entry => ({
            x: entry.date,
            y: entry.rank
        }));

        datasets.push({
            label: movieTitle,
            data: data,
            // Additional styling here, like borderColor, backgroundColor, etc.
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
                    // ... other y-axis configurations ...
                }
            },
            // ... other options ...
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    fetch('movies.json')
        .then(response => response.json())
        .then(data => {
            createAggregateChart(data); // Call this function to create the aggregate chart
            displayMovies(data);
        })
        .catch(error => console.error('Error:', error));
});

function displayMovies(moviesData) {
    const container = document.getElementById('movies-container');

    Object.keys(moviesData).forEach(movieTitle => {
        const movie = moviesData[movieTitle];
        const movieDiv = document.createElement('div');
        movieDiv.className = 'movie';
        const latestEntry = movie[movie.length - 1]; // Assuming the latest entry has the picture

        movieDiv.innerHTML = `
            <div class="movie-info">
                <img src="${latestEntry.picture}" alt="${movieTitle}" class="movie-picture">
                <span class="movie-title">#${latestEntry.rank} - ${movieTitle}</span>
            </div>
            <div class="chart-container">
                <canvas id="chart-${movieTitle}" class="movie-chart"></canvas>
            </div>
        `;

        container.appendChild(movieDiv);

        const maxRank = Math.max(...movie.map(entry => entry.rank));
        const yAxisMax = Math.ceil(maxRank / 10) * 10; // Round up to the nearest multiple of 10

        const ctx = document.getElementById(`chart-${movieTitle}`).getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: movie.map(entry => entry.date),
                datasets: [{
                    label: movieTitle,
                    data: movie.map(entry => entry.rank),
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
    });
}
