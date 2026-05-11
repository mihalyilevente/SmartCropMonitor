import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const WeatherChart = ({ data }) => {
  if (!data || data.length === 0) return <div style={{ textAlign: 'center', padding: '20px' }}>No chart data available</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={(str) => str ? str.split('T')[1].substring(0, 5) : ''}
        />
        <YAxis unit="°C" />
        <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
        <Line
          type="monotone"
          dataKey="weather_data.temp"
          stroke="#054e05"
          strokeWidth={2}
          dot={false}
          name="Temperature"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default WeatherChart;