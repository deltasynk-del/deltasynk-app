import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from '../models/portal.models';
import { LabelBatch, SaveLabelBatch } from '../models/product-labels.models';

/** Product barcode label batches for SynkMart shops. */
@Injectable({ providedIn: 'root' })
export class ProductLabelsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/product-labels`;

  list(query: { status?: string; q?: string; page?: number; pageSize?: number }): Observable<Page<LabelBatch>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Page<LabelBatch>>(this.base, { params });
  }

  get(id: string): Observable<LabelBatch> {
    return this.http.get<LabelBatch>(`${this.base}/${id}`);
  }

  create(body: SaveLabelBatch): Observable<LabelBatch> {
    return this.http.post<LabelBatch>(this.base, body);
  }

  update(id: string, body: SaveLabelBatch): Observable<LabelBatch> {
    return this.http.patch<LabelBatch>(`${this.base}/${id}`, body);
  }

  void(id: string, reason: string): Observable<LabelBatch> {
    return this.http.post<LabelBatch>(`${this.base}/${id}/void`, { reason });
  }
}
