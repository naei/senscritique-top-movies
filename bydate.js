let moviesData = {};
let chart = null;
let validDates = [];

document.addEventListener('DOMContentLoaded', function () {
    fetch('movies.json')
        .then(response => response.json())
        .then(data => {
            moviesData = data;
            initializeDatePickers();
        })
        .catch(error => console.error('Error:', error));
});

function initializeDatePickers() {
    validDates = extractValidDates(moviesData);

    const datePicker1 = new Pikaday({
        field: document.getElementById('dateInput1'),
        format: 'YYYY-MM-DD',
        toString(date, format) {
            return moment(date).format(format);
        },
        disableDayFn: function (date) {
            return !isValidDate(date);
        },
        onSelect: function () {
            renderChartForDates(this.getMoment().format('YYYY-MM-DD'), document.getElementById('dateInput2').value);
        }
    });

    const datePicker2 = new Pikaday({
        field: document.getElementById('dateInput2'),
        format: 'YYYY-MM-DD',
        toString(date, format) {
            return moment(date).format(format);
        },
        disableDayFn: function (date) {
            return !isValidDate(date);
        },
        onSelect: function () {
            renderChartForDates(document.getElementById('dateInput1').value, this.getMoment().format('YYYY-MM-DD'));
        }
    });
}

function extractValidDates(data) {
    let dates = new Set();
    Object.values(data).forEach(movies => {
        movies.forEach(entry => dates.add(entry.date));
    });
    return Array.from(dates);
}

function isValidDate(date) {
    const formattedDate = moment(date).format('YYYY-MM-DD');
    return validDates.includes(formattedDate);
}

function renderChartForDates(date1, date2) {
    const ctx = document.getElementById('rankingChart').getContext('2d');
    const rankingsData = {
        date1: [],
        date2: []
    };

    Object.keys(moviesData).forEach(movieTitle => {
        const movieEntries = moviesData[movieTitle];
        const entryForDate1 = movieEntries.find(entry => entry.date === date1);
        const entryForDate2 = movieEntries.find(entry => entry.date === date2);

        rankingsData.date1.push({
            label: movieTitle,
            ratingCount: entryForDate1 ? entryForDate1.ratingCount : null
        });
        rankingsData.date2.push({
            label: movieTitle,
            ratingCount: entryForDate2 ? entryForDate2.ratingCount : null
        });
    });

    // Prepare the data for the chart
    const labels = Object.keys(moviesData);
    const dataDate1 = rankingsData.date1.map(data => data.ratingCount);
    const dataDate2 = rankingsData.date2.map(data => data.ratingCount);

    if (chart) {
        chart.destroy(); // Destroy the previous chart
    }

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Rating Count on ' + (date1 || 'Date 1'),
                data: dataDate1,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }, {
                label: 'Rating Count on ' + (date2 || 'Date 2'),
                data: dataDate2,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                x: {
                    stacked: false
                },
                y: {
                    beginAtZero: true,
                    stacked: false
                }
            },
            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });
}
