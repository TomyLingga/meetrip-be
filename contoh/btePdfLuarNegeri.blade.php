<!DOCTYPE html>
<html>
<head>
        <title>Surat Pengajuan Panjar</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.1/dist/css/bootstrap.min.css" integrity="sha384-zCbKRCUGaJDkqS1kPbPd7TveP5iyJE0EjAuZQTgFLD2ylzuqKfdKlfG/eSrtxUkn" crossorigin="anonymous">
</head>
<style type="text/css">
        .under{
                text-decoration: underline;
        }
        .font{
                font-family:sans-serif;
                font-size: 12.5px;
                color: black;
        }
        .bold{
                font-weight: bold;
        }
</style>
<body style="margin: -15px -26px 0px 0px;">
        <div style="padding:10px; border:2px solid;">
                <table class="" width="100%">
                        <thead>
                                <tr class="text-center">
                                        <td class="border border-dark" rowspan="4">
                                                <img src="storage/upload/surat/inl.png" width="83">
                                        </td>
                                        <td class="border border-dark text-center" rowspan="3">
                                                <strong style="text-decoration: underline; font-size:16px;">PT. INDUSTRI NABATI LESTARI</strong><br>
                                                <label style="font-size:12px;">PABRIK MINYAK GORENG</label><br>
                                                <label style="font-size:8px;"><strong>Kantor Pusat:</strong> Komp. KEK Sei Mangkei, Kav.2-3, Kec. Bosar Maligas, Kab. Simalungun, Sumatera Utara, 21184</label>
                                        </td>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">No. Dokumen</strong>
                                        </th>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">Tgl. Berlaku</strong>
                                        </th>
                                </tr>
                                <tr class="text-center">
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">INLHO/BSIS-GEA/F-014</label>
                                        </td>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">21-Mar-22</label>
                                        </td>
                                </tr>
                                <tr>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">No.Revisi</strong>
                                        </th>
                                        <th class="border border-dark">
                                                <strong style="font-size:10px;">Halaman</strong>
                                        </th>
                                </tr>
                                <tr class="text-center">
                                        <th class="border border-dark">
                                                <strong style="font-size:14px;">DETAIL OF BUSSINES TRIP EXPENSES (BTE) ABROAD</strong>
                                        </th>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">01</label>
                                        </td>
                                        <td class="border border-dark">
                                                <label style="font-size:10px;">1 dari 1</label>
                                        </td>
                                </tr>
                        </thead>
                </table>
                <table class="mt-3" width="100%">
                        <tbody>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" width="4%">I</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" width="15%" colspan="3"><strong>SPJ/BTO NUMBER</strong></td>
                                        @if($form->nomor_surat == '0')
                                        <td colspan="4">: &nbsp; LETTER NOT YET RELEASED</td>
                                        @else
                                        <td colspan="4">: &nbsp; {{$form->nomor_surat}}</td>
                                        @endif
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">II</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>NAME</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper($form->nama_pelaksana)}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">III</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>POSITION</strong></td>
                                        @if($form->jabatan == 'Direktur Utama')
                                        <td colspan="4">: &nbsp; DIREKTUR</td>
                                        @elseif($form->jabatan == 'General Manager')
                                        <td colspan="4">: &nbsp; {{strtoupper($form->jabatan)}} {{strtoupper($form->divisi)}}</td>
                                        @else
                                        <td colspan="4">: &nbsp; {{strtoupper($form->jabatan)}}</td>
                                        @endif
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IV</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>JOB LEVEL</strong></td>
                    @if($joblevel->grade == '1')
                                        <td colspan="4">: &nbsp; JUNIOR STAFF/EQUAL</td>
                                        @elseif($joblevel->grade == '2')
                                        <td colspan="4">: &nbsp; STAFF/EQUAL</td>
                                        @elseif($joblevel->grade == '3')
                                        <td colspan="4">: &nbsp; SENIOR STAFF/EQUAL</td>
                                        @elseif($joblevel->grade == '4')
                                        <td colspan="4">: &nbsp; EXECUTIVE/EQUAL</td>
                                        @elseif($joblevel->grade == '5')
                                        <td colspan="4">: &nbsp; GENERAL MANAGER/EQUAL</td>
                                        @elseif($joblevel->grade == '6')
                                        <td colspan="4">: &nbsp; DIRECTOR/EQUAL</td>
                                        @elseif($joblevel->grade == '13')
                                        <td colspan="4">: &nbsp; SEVP/COMMISSIONER/EQUAL</td>
                                        @endif
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">V</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>DESTINATION</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper($form->tujuan)}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VI</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>NECESSARY</strong></td>
                                        <td colspan="4">:  &nbsp; {{strtoupper($form->keperluan)}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VII</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>TOTAL DAYS</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper($form->lama_hari)}} HARI</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VIII</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>PERIODE</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" rowspan="2"></td>
                                        <td class="border border-dark text-center" width="4%">VIII.1</td>
                                        <td style="font-style: italic;" colspan="2"><strong>START</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper(Carbon\Carbon::parse($form->tgl_pergi)->locale('id_ID')->isoFormat('LL'))}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">VIII.2</td>
                                        <td style="font-style: italic;" colspan="2"><strong>END</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper(Carbon\Carbon::parse($form->tgl_sampai)->locale('id_ID')->isoFormat('LL'))}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>DESCRIPTION OF SCHEDULE</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" rowspan="4"></td>
                                        <td class="border border-dark text-center" width="5%">IX.1</td>
                                        <td style="font-style: italic;" colspan="2"><strong>DEPARTURE DATE</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper(Carbon\Carbon::parse($form->tgl_pergi)->locale('id_ID')->isoFormat('LL'))}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.2</td>
                                        <td style="font-style: italic;" colspan="2"><strong>DEPARTURE TIME</strong></td>
                                        <td colspan="4">: &nbsp; {{$form->jam_pergi}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.3</td>
                                        <td style="font-style: italic;" colspan="2"><strong>ARRIVAL DATE</strong></td>
                                        <td colspan="4">: &nbsp; {{strtoupper(Carbon\Carbon::parse($form->tgl_sampai)->locale('id_ID')->isoFormat('LL'))}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">IX.4</td>
                                        <td style="font-style: italic;" colspan="2"><strong>ARRIVAL TIME</strong></td>
                                        <td colspan="4">: &nbsp; {{$form->jam_sampai}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X</td>
                                        <!-- <td></td> -->
                                        <td style="font-style: italic;" colspan="3"><strong>DETAIL OF TRAVEL EXPENSES</strong></td>
                                        <td colspan="4"></td>
                                </tr>
                <?php
                    $etc = 0;
                    $uang_lain = $luarnegeri->lain;
                    $data = json_decode($uang_lain);
                    for ($i=0; $i < count($data); $i++) {

                        $rio = $data[$i]->nilailain;
                        $etc += (float)$rio;
                    }
                    if($luarnegeri->lain != null){
                        $count = count($data);
                    }else{
                        $count = 0;
                    }
                    // dd($count);
                ?>
                                <tr class="border border-dark" style="font-size:10px;">
                    <td class="border border-dark text-center" rowspan="{{13+$count}}"></td>
                                        <td class="border border-dark text-center" width="8%" rowspan="2"><strong>Number</strong></td>
                                        <td class="border border-dark text-center" rowspan="2"><strong>Expenditure</strong></td>
                                        <td class="border border-dark text-center" colspan="5"><strong>Unit Price (USD)</strong></td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center" colspan="2"><strong>Total USD</strong></td>
                                        <td class="border border-dark text-center" colspan="2"><strong>*USD 1=Rp</strong></td>
                                        <td class="border border-dark text-center"><strong>Conversion</strong></td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.1</td>
                                        <td class="border border-dark">HOTEL</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_hotel}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_hotel}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.2</td>
                                        <td class="border border-dark">BREAKFAST</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->sarapan}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->sarapan}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.3</td>
                                        <td class="border border-dark">LUNCH</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->makan_siang}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->makan_siang}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.4</td>
                                        <td class="border border-dark">DINNER</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->makan_malam}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->makan_malam}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.5</td>
                                        <td class="border border-dark">POCKET MONEY</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_saku}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_saku}}</td>
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.6</td>
                                        <td class="border border-dark">LAUNDRY</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_laundry}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_laundry}}</td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.7</td>
                                        <td class="border border-dark">COMMUNICATION</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_komunikasi}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_komunikasi}}</td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.8</td>
                                        <td class="border border-dark">LOCAL TRANSPORT</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_transport_dilokasi}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_transport_dilokasi}}</td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.9</td>
                                        <td class="border border-dark">AIRPORT TRANSPORT</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->airport}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->airport}}</td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.10</td>
                                        <td class="border border-dark">ROUND-TRIP</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_pp}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_pp}}</td>
                                </tr>
                <tr class="border border-dark" style="font-size:10px;">
                                        <td class="border border-dark text-center">X.1.11</td>
                                        <td class="border border-dark">** FLIGHT</td>
                                        <td class="border border-dark" colspan="2">$ {{$luarnegeri->uang_tiket}}</td>
                                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $luarnegeri->uang_tiket}}</td>
                                </tr>
                @if($luarnegeri->lain != null)
                @for($i = 0 ; $i < $count ; $i++)
                    <tr class="border border-dark" style="font-size:10px;">
                        <td class="border border-dark text-center"><strong>ETC</strong></td>
                        <td class="border border-dark">{{$data[$i]->datalain}}</td>
                        <td class="border border-dark" colspan="2">$ {{$data[$i]->nilailain}}</td>
                        <td class="border border-dark" colspan="2">Rp. {{$luarnegeri->kurs_usd}}</td>
                        <td class="border border-dark">Rp. {{$luarnegeri->kurs_usd * $data[$i]->nilailain}}</td>
                    </tr>
                @endfor
                @endif
                {{$total = $luarnegeri->sarapan+$luarnegeri->makan_siang+$luarnegeri->makan_malam+
                           $luarnegeri->uang_hotel+$luarnegeri->uang_saku+$luarnegeri->uang_laundry+
                           $luarnegeri->uang_komunikasi+$luarnegeri->uang_transport_dilokasi+$luarnegeri->airport+
                           $luarnegeri->uang_tiket+$luarnegeri->uang_pp+$etc}}
                @if($luarnegeri2 != null)
                {{$hasil = $luarnegeri2->sarapan+$luarnegeri2->makan_siang+$luarnegeri2->makan_malam+
                            $luarnegeri2->saku+$luarnegeri2->hotel+
                            $luarnegeri2->laundry+$luarnegeri2->transport_dilokasi+$luarnegeri2->tiket+
                            $luarnegeri2->komunikasi+$luarnegeri2->airport}}
                @endif

                <tr class="border border-dark" style="font-size:10px;">
                    <!-- <td></td> -->
                    <td class="border border-dark text-center" style="font-style: italic;" colspan="3"><strong>TOTAL</strong></td>
                    <!-- <td colspan="3"></td> -->
                    <td class="border border-dark" colspan="2"><strong>$ {{$total}}</strong></td>
                    <td class="border border-dark" colspan="2"><strong>Rp. {{$luarnegeri->kurs_usd}}</strong></td>
                    <td class="border border-dark"><strong>Rp. {{$luarnegeri->kurs_usd * $total}}</strong></td>
                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <!-- <td></td> -->
                                        <td class="border border-dark text-center" style="font-style: italic;" colspan="3"><strong>DOWN PAYMENT</strong></td>
                                        <!-- <td colspan="3"></td> -->
                    @if($luarnegeri2 != null)
                    <td class="border border-dark" colspan="2"><strong>$ {{$hasil}}</strong></td>
                                        <td class="border border-dark" colspan="2"><strong>Rp. {{$luarnegeri2->kurs_usd}}</strong></td>
                                        <td class="border border-dark"><strong>Rp. {{$luarnegeri2->kurs_usd * $hasil}}</strong></td>
                    @else
                    <td class="border border-dark" colspan="2"><strong>$ 0</strong></td>
                                        <td class="border border-dark" colspan="2"><strong>Rp. 0</strong></td>
                                        <td class="border border-dark"><strong>Rp. 0</strong></td>
                    @endif
                                </tr>
                                <tr class="border border-dark" style="font-size:10px;">
                                        <!-- <td></td> -->
                                        <td class="border border-dark text-center" style="font-style: italic;" colspan="3"><strong>TOTAL - DOWN PAYMENT</strong></td>
                                        <!-- <td colspan="3"></td> -->
                    @if($luarnegeri2 != null)
                    <td class="border border-dark" colspan="2"><strong>$ {{$total - $hasil}}</strong></td>
                                        <td class="border border-dark" colspan="2"><strong></strong></td>
                                        <td class="border border-dark"><strong>Rp. {{($luarnegeri->kurs_usd * $total)-($luarnegeri2->kurs_usd * $hasil)}}</strong></td>
                    @else
                    <td class="border border-dark" colspan="2"><strong>$ {{$total}}</strong></td>
                                        <td class="border border-dark" colspan="2"><strong></strong></td>
                                        <td class="border border-dark"><strong>Rp. {{($luarnegeri->kurs_usd * $total)}}</strong></td>
                    @endif
                                </tr>
                        </tbody>
                </table>
                <table width="100%" class="mt-5">
                        <thead>
                                <tr>
                                        <td width="60%" style="font-size:11px;">
                                                <strong>Notes:</strong><br>
                        <span>* Nilai tukar mata uang berdasarkan nilai tengah Jisdor (US-IDR) BI Tgl</span><br>
                        <span>** Tiket pesawat yang dibeli adalah tiket pesawat pergi pulang</span>
                                        </td>
                                        <td class="text-center">
                                                <label style="font-size:11px;">Sign by Personalia: <strong style="font-style:italic;">GA Administrator</strong></label>
                                        </td>
                                </tr>
                        </thead>
                </table>
        </div>

        <div style="position: fixed; bottom: 20px; left: -25px; right: 0px; height: 50px;">
                <table width="100%">
                        <tr>
                                <td>
                                        <img src="storage/upload/surat/footer.PNG" width="760">

                                </td>
                        </tr>
                </table>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/jquery@3.5.1/dist/jquery.slim.min.js" integrity="sha384-DfXdz2htPH0lsSSs5nCTpuj/zy4C+OGpamoFVy38MVBnE+IbbVYUew+OrCXaRkfj" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.1/dist/js/bootstrap.bundle.min.js" integrity="sha384-fQybjgWLrvvRgtW6bFlB7jaZrFsaBXjsOMm/tB9LTS58ONXgqbR9W8oWht/amnpF" crossorigin="anonymous"></script>
</body>
</html>
