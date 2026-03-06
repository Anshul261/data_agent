import json
import uuid
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional, Union

from agno.tools import Toolkit
from agno.utils.log import log_info, logger
from sqlalchemy import Column, DateTime, LargeBinary, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session


class _Base(DeclarativeBase):
    pass


class _Chart(_Base):
    __tablename__ = "charts"

    id = Column(String(36), primary_key=True)
    chart_type = Column(String(50), nullable=False)
    title = Column(String(500), nullable=False)
    image_data = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class VisualizationTools(Toolkit):
    def __init__(
        self,
        db_url: str,
        base_url: str = "http://localhost:7777",
        enable_create_bar_chart: bool = True,
        enable_create_line_chart: bool = True,
        enable_create_pie_chart: bool = True,
        enable_create_scatter_plot: bool = True,
        enable_create_histogram: bool = True,
        all: bool = False,
        **kwargs,
    ):
        try:
            import matplotlib

            matplotlib.use("Agg")
        except ImportError:
            raise ImportError("matplotlib is not installed. Please install it using: `pip install matplotlib`")

        self.base_url = base_url.rstrip("/")
        self._engine = create_engine(
            db_url,
            pool_pre_ping=True,   # test connection before use — handles stale Azure connections
            pool_recycle=1800,    # recycle connections every 30 min
        )
        _Base.metadata.create_all(self._engine)

        tools: List[Any] = []
        if enable_create_bar_chart or all:
            tools.append(self.create_bar_chart)
        if enable_create_line_chart or all:
            tools.append(self.create_line_chart)
        if enable_create_pie_chart or all:
            tools.append(self.create_pie_chart)
        if enable_create_scatter_plot or all:
            tools.append(self.create_scatter_plot)
        if enable_create_histogram or all:
            tools.append(self.create_histogram)

        super().__init__(name="visualization_tools", tools=tools, **kwargs)

    def _apply_style(self):
        import matplotlib.pyplot as plt

        try:
            plt.style.use("seaborn-v0_8")
        except OSError:
            plt.style.use("ggplot")

    def _render_to_png(self, fig) -> bytes:
        buf = BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        buf.seek(0)
        png_bytes = buf.read()
        buf.close()
        return png_bytes

    def _save_chart(self, png_bytes: bytes, chart_type: str, title: str) -> str:
        chart_id = str(uuid.uuid4())
        chart = _Chart(
            id=chart_id,
            chart_type=chart_type,
            title=title,
            image_data=png_bytes,
        )
        with Session(self._engine) as session:
            session.add(chart)
            session.commit()
        return chart_id

    def _get_chart_url(self, chart_id: str) -> str:
        return f"{self.base_url}/api/charts/{chart_id}"

    def get_chart_bytes(self, chart_id: str) -> Optional[bytes]:
        """Retrieve chart PNG bytes by ID. Returns None if not found."""
        try:
            with Session(self._engine) as session:
                chart = session.get(_Chart, chart_id)
                if chart:
                    return bytes(chart.image_data)
                logger.warning(f"Chart {chart_id} not found in database")
                return None
        except Exception as e:
            logger.error(f"Error retrieving chart {chart_id}: {e}")
            return None

    def _normalize_data_for_charts(
        self, data: Union[Dict[str, Any], List[Dict[str, Any]], List[Any], str]
    ) -> Dict[str, Union[int, float]]:
        """
        Normalize various data formats into a simple dictionary format for charts.

        Args:
            data: Can be a dict, list of dicts, or list of values

        Returns:
            Dict with string keys and numeric values
        """
        if isinstance(data, dict):
            return {str(k): float(v) if isinstance(v, (int, float)) else 0 for k, v in data.items()}

        elif isinstance(data, list) and len(data) > 0:
            if isinstance(data[0], dict):
                result = {}
                for item in data:
                    if isinstance(item, dict):
                        keys = list(item.keys())
                        if len(keys) >= 2:
                            label_key = keys[0]
                            value_key = keys[1]
                            result[str(item[label_key])] = (
                                float(item[value_key]) if isinstance(item[value_key], (int, float)) else 0
                            )
                return result
            else:
                return {f"Item {i + 1}": float(v) if isinstance(v, (int, float)) else 0 for i, v in enumerate(data)}

        return {"Data": 1.0}

    def create_bar_chart(
        self,
        data: Union[Dict[str, Union[int, float]], List[Dict[str, Any]], str],
        title: str = "Bar Chart",
        x_label: str = "Categories",
        y_label: str = "Values",
    ) -> str:
        """
        Create a bar chart and return a URL to the chart image.

        Use this after querying data from ClickHouse to visualize categorical comparisons.
        Include the returned chart_url in your markdown response as ![Chart Title](chart_url).

        Args:
            data: Dictionary with categories as keys and values as numbers,
                  or list of dictionaries, or JSON string.
                  Example: {"Open": 150, "Closed": 230, "In Progress": 85}
            title: Title displayed above the chart
            x_label: Label for the horizontal axis
            y_label: Label for the vertical axis

        Returns:
            str: JSON with status and chart_url. Embed chart_url as ![title](chart_url) in your response.
        """
        try:
            import matplotlib.pyplot as plt

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    pass

            normalized_data = self._normalize_data_for_charts(data)
            categories = list(normalized_data.keys())
            values = list(normalized_data.values())

            self._apply_style()
            fig = plt.figure(figsize=(10, 6))
            plt.bar(categories, values)
            plt.title(title)
            plt.xlabel(x_label)
            plt.ylabel(y_label)
            plt.xticks(rotation=45, ha="right")
            plt.tight_layout()

            png_bytes = self._render_to_png(fig)
            plt.close(fig)

            chart_id = self._save_chart(png_bytes, "bar_chart", title)
            chart_url = self._get_chart_url(chart_id)

            log_info(f"Bar chart created: {chart_url}")

            return json.dumps(
                {
                    "chart_type": "bar_chart",
                    "title": title,
                    "chart_url": chart_url,
                    "data_points": len(normalized_data),
                    "status": "success",
                }
            )

        except Exception as e:
            logger.error(f"Error creating bar chart: {str(e)}")
            return json.dumps({"chart_type": "bar_chart", "error": str(e), "status": "error"})

    def create_line_chart(
        self,
        data: Union[Dict[str, Union[int, float]], List[Dict[str, Any]], str],
        title: str = "Line Chart",
        x_label: str = "X-axis",
        y_label: str = "Y-axis",
    ) -> str:
        """
        Create a line chart and return a URL to the chart image.

        Use this after querying data from ClickHouse to visualize trends over time.
        Include the returned chart_url in your markdown response as ![Chart Title](chart_url).

        Args:
            data: Dictionary with x-values as keys and y-values as numbers,
                  or list of dictionaries, or JSON string.
                  Example: {"Jan": 100, "Feb": 135, "Mar": 128}
            title: Title displayed above the chart
            x_label: Label for the horizontal axis
            y_label: Label for the vertical axis

        Returns:
            str: JSON with status and chart_url. Embed chart_url as ![title](chart_url) in your response.
        """
        try:
            import matplotlib.pyplot as plt

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    pass

            normalized_data = self._normalize_data_for_charts(data)
            x_values = list(normalized_data.keys())
            y_values = list(normalized_data.values())

            self._apply_style()
            fig = plt.figure(figsize=(10, 6))
            plt.plot(x_values, y_values, marker="o", linewidth=2, markersize=6)
            plt.title(title)
            plt.xlabel(x_label)
            plt.ylabel(y_label)
            plt.xticks(rotation=45, ha="right")
            plt.grid(True, alpha=0.3)
            plt.tight_layout()

            png_bytes = self._render_to_png(fig)
            plt.close(fig)

            chart_id = self._save_chart(png_bytes, "line_chart", title)
            chart_url = self._get_chart_url(chart_id)

            log_info(f"Line chart created: {chart_url}")

            return json.dumps(
                {
                    "chart_type": "line_chart",
                    "title": title,
                    "chart_url": chart_url,
                    "data_points": len(normalized_data),
                    "status": "success",
                }
            )

        except Exception as e:
            logger.error(f"Error creating line chart: {str(e)}")
            return json.dumps({"chart_type": "line_chart", "error": str(e), "status": "error"})

    def create_pie_chart(
        self,
        data: Union[Dict[str, Union[int, float]], List[Dict[str, Any]], str],
        title: str = "Pie Chart",
    ) -> str:
        """
        Create a pie chart and return a URL to the chart image.

        Use this after querying data from ClickHouse to visualize proportional breakdowns.
        Include the returned chart_url in your markdown response as ![Chart Title](chart_url).

        Args:
            data: Dictionary with categories as keys and values as numbers,
                  or list of dictionaries, or JSON string.
                  Example: {"Open": 150, "Closed": 230, "In Progress": 85}
            title: Title displayed above the chart

        Returns:
            str: JSON with status and chart_url. Embed chart_url as ![title](chart_url) in your response.
        """
        try:
            import matplotlib.pyplot as plt

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    pass

            normalized_data = self._normalize_data_for_charts(data)
            labels = list(normalized_data.keys())
            values = list(normalized_data.values())

            self._apply_style()
            fig = plt.figure(figsize=(10, 8))
            plt.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
            plt.title(title)
            plt.axis("equal")

            png_bytes = self._render_to_png(fig)
            plt.close(fig)

            chart_id = self._save_chart(png_bytes, "pie_chart", title)
            chart_url = self._get_chart_url(chart_id)

            log_info(f"Pie chart created: {chart_url}")

            return json.dumps(
                {
                    "chart_type": "pie_chart",
                    "title": title,
                    "chart_url": chart_url,
                    "data_points": len(normalized_data),
                    "status": "success",
                }
            )

        except Exception as e:
            logger.error(f"Error creating pie chart: {str(e)}")
            return json.dumps({"chart_type": "pie_chart", "error": str(e), "status": "error"})

    def create_scatter_plot(
        self,
        x_data: Optional[List[Union[int, float]]] = None,
        y_data: Optional[List[Union[int, float]]] = None,
        title: str = "Scatter Plot",
        x_label: str = "X-axis",
        y_label: str = "Y-axis",
        x: Optional[List[Union[int, float]]] = None,
        y: Optional[List[Union[int, float]]] = None,
        data: Optional[Union[List[List[Union[int, float]]], Dict[str, List[Union[int, float]]]]] = None,
    ) -> str:
        """
        Create a scatter plot and return a URL to the chart image.

        Use this after querying data from ClickHouse to visualize correlations between two variables.
        Include the returned chart_url in your markdown response as ![Chart Title](chart_url).

        Args:
            x_data: List of x-values (can also use 'x' parameter)
            y_data: List of y-values (can also use 'y' parameter)
            title: Title displayed above the chart
            x_label: Label for the horizontal axis
            y_label: Label for the vertical axis
            data: Alternative format - list of [x,y] pairs or dict with 'x' and 'y' keys

        Returns:
            str: JSON with status and chart_url. Embed chart_url as ![title](chart_url) in your response.
        """
        try:
            import matplotlib.pyplot as plt

            if x_data is None:
                x_data = x
            if y_data is None:
                y_data = y

            if data is not None:
                if isinstance(data, dict):
                    if "x" in data and "y" in data:
                        x_data = data["x"]
                        y_data = data["y"]
                elif isinstance(data, list) and len(data) > 0:
                    if isinstance(data[0], list) and len(data[0]) == 2:
                        x_data = [point[0] for point in data]
                        y_data = [point[1] for point in data]

            if x_data is None or y_data is None:
                raise ValueError("Missing x_data and y_data parameters")

            if len(x_data) != len(y_data):
                raise ValueError("x_data and y_data must have the same length")

            self._apply_style()
            fig = plt.figure(figsize=(10, 6))
            plt.scatter(x_data, y_data, alpha=0.7, s=50)
            plt.title(title)
            plt.xlabel(x_label)
            plt.ylabel(y_label)
            plt.grid(True, alpha=0.3)
            plt.tight_layout()

            png_bytes = self._render_to_png(fig)
            plt.close(fig)

            chart_id = self._save_chart(png_bytes, "scatter_plot", title)
            chart_url = self._get_chart_url(chart_id)

            log_info(f"Scatter plot created: {chart_url}")

            return json.dumps(
                {
                    "chart_type": "scatter_plot",
                    "title": title,
                    "chart_url": chart_url,
                    "data_points": len(x_data),
                    "status": "success",
                }
            )

        except Exception as e:
            logger.error(f"Error creating scatter plot: {str(e)}")
            return json.dumps({"chart_type": "scatter_plot", "error": str(e), "status": "error"})

    def create_histogram(
        self,
        data: List[Union[int, float]],
        bins: int = 10,
        title: str = "Histogram",
        x_label: str = "Values",
        y_label: str = "Frequency",
    ) -> str:
        """
        Create a histogram and return a URL to the chart image.

        Use this after querying data from ClickHouse to visualize data distributions.
        Include the returned chart_url in your markdown response as ![Chart Title](chart_url).

        Args:
            data: List of numeric values to plot
            bins: Number of bins for the histogram
            title: Title displayed above the chart
            x_label: Label for the horizontal axis
            y_label: Label for the vertical axis

        Returns:
            str: JSON with status and chart_url. Embed chart_url as ![title](chart_url) in your response.
        """
        try:
            import matplotlib.pyplot as plt

            if not isinstance(data, list) or len(data) == 0:
                raise ValueError("Data must be a non-empty list of numbers")

            numeric_data = []
            for value in data:
                try:
                    numeric_data.append(float(value))
                except (ValueError, TypeError):
                    continue

            if len(numeric_data) == 0:
                raise ValueError("No valid numeric data found")

            self._apply_style()
            fig = plt.figure(figsize=(10, 6))
            plt.hist(numeric_data, bins=bins, alpha=0.7, edgecolor="black")
            plt.title(title)
            plt.xlabel(x_label)
            plt.ylabel(y_label)
            plt.grid(True, alpha=0.3)
            plt.tight_layout()

            png_bytes = self._render_to_png(fig)
            plt.close(fig)

            chart_id = self._save_chart(png_bytes, "histogram", title)
            chart_url = self._get_chart_url(chart_id)

            log_info(f"Histogram created: {chart_url}")

            return json.dumps(
                {
                    "chart_type": "histogram",
                    "title": title,
                    "chart_url": chart_url,
                    "data_points": len(numeric_data),
                    "bins": bins,
                    "status": "success",
                }
            )

        except Exception as e:
            logger.error(f"Error creating histogram: {str(e)}")
            return json.dumps({"chart_type": "histogram", "error": str(e), "status": "error"})
